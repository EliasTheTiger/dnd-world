'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),output=path.join(__dirname,'evidence','characters');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html',file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(30000);
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
// Fixture setup only. Every campaign switch, cast, cancellation and rest below uses the actual UI.
await page.evaluate(()=>{const c=Object.assign(buildBlank(),{id:'qa-mana',name:'Эйра: проверка магии',cls:'Волшебник',subcls:'Школа Воплощения',level:3,bg:'Мудрец',biography:'Описание жизни без механических бонусов.'});characterAdopt(c);applyClassSlots(c);c.spellbook=[{id:'qa-mm',spellId:'sp_burning_hands',access:'spellbook',prep:true}];const target=Object.assign(buildBlank(),{id:'qa-target',name:'Учебная цель',hp:50,hpMax:50});chars=[c,target];activeCharId=c.id;sheetTab='spells';renderChars();scheduleSave();});
const mode=page.locator('#campaign-magic-mode');await mode.selectOption('mp');await page.locator('.magic-pool strong').waitFor();
await page.waitForFunction(()=>!magicSwitchBusy);assert.match(await page.locator('.magic-pool strong').innerText(),/14\s*\/\s*14 MP/);assert.equal(await page.locator('.slot-gem').count(),0);
const cast=page.locator('button[onclick="castSpellFx(\'sp_burning_hands\',\'qa-mana\')"]');
await cast.click();assert.match(await page.locator('#castResourceLabel').innerText(),/MP/);await page.locator('#castSlot').selectOption('2');await page.locator('#castTarget').selectOption('ally:qa-target');await page.locator('#castConfirmBtn').click();
if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
console.log('Formula: '+await page.locator('#castFormula').innerText());
await page.screenshot({path:path.join(output,'08-mp-cast.png'),fullPage:true});
// Cancel before the shared resource commit.
await page.locator('#castStep3').getByRole('button',{name:'Отмена',exact:true}).click();
assert.equal(await page.evaluate(()=>magicPool(getCh('qa-mana')).cur),14);
await cast.click();await page.locator('#castSlot').selectOption('2');await page.locator('#castTarget').selectOption('ally:qa-target');await page.locator('#castConfirmBtn').click();if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
await page.locator('#cf_save').fill('1');const damage=page.locator('#castFormula input[type="number"]:visible').first();await damage.fill('8');await page.getByRole('button',{name:'Применить итог',exact:true}).click();
await page.locator('#castBack').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>magicPool(getCh('qa-mana')).cur),11);assert.equal(await page.evaluate(()=>getCh('qa-target').hp),42);
await page.screenshot({path:path.join(output,'09-mp-sheet.png'),fullPage:true});
await mode.selectOption('slots');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.mode==='slots');assert.ok(await page.locator('.slot-gem').count()>0);
await mode.selectOption('mp');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.mode==='mp');assert.equal(await page.evaluate(()=>magicPool(getCh('qa-mana')).cur),11);
await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).waitFor({timeout:120000});await page.locator('.char-card').filter({hasText:'Эйра: проверка магии'}).click();await page.locator('.subtab').filter({hasText:'Заклинания'}).click();assert.equal(await mode.inputValue(),'mp');assert.match(await page.locator('.magic-pool strong').innerText(),/11\s*\/\s*14 MP/);assert.equal(await page.evaluate(()=>getCh('qa-mana').biography),'Описание жизни без механических бонусов.');
const savedBook=await page.evaluate(()=>JSON.stringify(getCh('qa-mana').spellbook));
const access=page.locator('#campaign-mp-access');assert.equal(await access.inputValue(),'class');await access.selectOption('free');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.preparation==='free');
assert.equal(await page.locator('.prep-btn').count(),0);assert.ok(await page.locator('.magic-book-pages').count()>0);await page.screenshot({path:path.join(output,'11-mp-free-desktop.png'),fullPage:false});await page.locator('.magic-book-pages').first().getByRole('button',{name:'Далее →',exact:true}).click();assert.match(await page.locator('.magic-book-pages').first().innerText(),/25–/);
const search=page.getByRole('textbox',{name:'Поиск заклинаний героя',exact:true});await search.fill('Ядовитые брызги');const freeCast=page.locator('button[onclick="castSpellFx(\'sp_ядовитые_брызги\',\'qa-mana\')"]');await freeCast.click();await page.locator('#castTarget').selectOption('ally:qa-target');await page.locator('#castConfirmBtn').click();if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
await page.locator('#cf_save').fill('1');await page.locator('#castFormula input[type="number"]:visible').first().fill('5');await page.getByRole('button',{name:'Применить итог',exact:true}).click();await page.locator('#castBack').waitFor({state:'hidden'});
assert.equal(await page.evaluate(()=>getCh('qa-target').hp),37);assert.equal(await page.evaluate(()=>magicPool(getCh('qa-mana')).cur),11);assert.equal(await page.evaluate(()=>JSON.stringify(getCh('qa-mana').spellbook)),savedBook);
await access.selectOption('class');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.preparation==='class');assert.equal(await freeCast.count(),0);await access.selectOption('free');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.preparation==='free');
await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).waitFor({timeout:120000});await page.locator('.char-card').filter({hasText:'Эйра: проверка магии'}).click();await page.locator('.subtab').filter({hasText:'Заклинания'}).click();assert.equal(await access.inputValue(),'free');assert.equal(await page.evaluate(()=>JSON.stringify(getCh('qa-mana').spellbook)),savedBook);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'10-mp-mobile.png'),fullPage:true});for(const selector of ['.magic-settings','.magic-pool','.magic-book-pages'])assert.equal(await page.locator(selector).first().evaluate(el=>el.scrollWidth<=el.clientWidth),true,selector+' must fit a mobile viewport');
await page.getByRole('button',{name:'☾ Долгий отдых',exact:true}).first().click();assert.match(await page.locator('.magic-pool strong').innerText(),/14\s*\/\s*14 MP/);assert.equal(await page.locator('.slot-gem').count(),0);
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'magic-browser-result.json'),JSON.stringify({ok:true,checks:['campaign MP switch','single MP pool','manual upcast damage','cancel before commit','MP spent once','slot round trip','persistent mode and balance','2.1 class list pagination and search','unlearned cantrip manual save and damage','2.2 restores exact book','free access persists after reload','biography retention','mobile 390px','long rest','no browser exceptions']},null,2));console.log('Magic systems browser journey passed.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

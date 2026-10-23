'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','magic-systems'));fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/(?:dnd-world\/)?/,'')||'index.html',file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'&&/^Есть ли линия видимости до ally:qa-target\?/.test(dialog.message())?'да':undefined));page.setDefaultTimeout(30000);
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
assert.equal(await page.locator('#campaign-mp-access').count(),0);assert.equal(await page.evaluate(()=>campaignMagic.preparation),'class');
const profile=page.getByRole('region',{name:'Изучение заклинаний героя'});await profile.waitFor();assert.match(await profile.innerText(),/Книга и подготовка/);
await page.locator('#spell-choice-learn').selectOption('sp_ядовитые_брызги');await profile.getByRole('button',{name:'Изучить и сохранить',exact:true}).click();
await page.waitForFunction(()=>!gameActionInteractionLocked()&&getCh('qa-mana').spellbook.some(row=>row.spellId==='sp_ядовитые_брызги'));
assert.deepEqual(await page.evaluate(()=>getCh('qa-mana').spellbook.filter(row=>row.spellId!=='sp_ядовитые_брызги')),JSON.parse(savedBook));
const learnedBook=await page.evaluate(()=>JSON.stringify(getCh('qa-mana').spellbook));
const search=page.getByRole('textbox',{name:'Поиск заклинаний героя',exact:true});await search.fill('Ядовитые брызги');const learnedCast=page.locator('button[onclick="castSpellFx(\'sp_ядовитые_брызги\',\'qa-mana\')"]');await learnedCast.click();await page.locator('#castTarget').selectOption('ally:qa-target');await page.locator('#castConfirmBtn').click();if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
await page.locator('#cf_save').fill('1');await page.locator('#castFormula input[type="number"]:visible').first().fill('5');await page.getByRole('button',{name:'Применить итог',exact:true}).click();await page.locator('#castBack').waitFor({state:'hidden'});
assert.equal(await page.evaluate(()=>getCh('qa-target').hp),37);assert.equal(await page.evaluate(()=>magicPool(getCh('qa-mana')).cur),11);assert.deepEqual(await page.evaluate(()=>getCh('qa-mana').spellbook),JSON.parse(learnedBook));
await page.waitForFunction(()=>!hasUnsavedCampaignChanges());await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).waitFor({timeout:120000});await page.locator('.char-card').filter({hasText:'Эйра: проверка магии'}).click();await page.locator('.subtab').filter({hasText:'Заклинания'}).click();assert.equal(await page.evaluate(()=>campaignMagic.preparation),'class');assert.deepEqual(await page.evaluate(()=>getCh('qa-mana').spellbook),JSON.parse(learnedBook));
await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'10-mp-mobile.png'),fullPage:true});for(const selector of ['.magic-settings','.magic-pool','[aria-label="Изучение заклинаний героя"]'])assert.equal(await page.locator(selector).first().evaluate(el=>el.scrollWidth<=el.clientWidth),true,selector+' must fit a mobile viewport');
await page.getByRole('button',{name:'☾ Долгий отдых',exact:true}).first().click();assert.match(await page.locator('.magic-pool strong').innerText(),/14\s*\/\s*14 MP/);assert.equal(await page.locator('.slot-gem').count(),0);
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'magic-browser-result.json'),JSON.stringify({ok:true,checks:['campaign MP switch','single MP pool','manual upcast damage','cancel before commit','MP spent once','slot round trip','persistent mode and balance','automatic class learning in MP','learned cantrip manual save and damage','existing book preserved','learned choice persists after reload','biography retention','mobile 390px','long rest','no browser exceptions']},null,2));console.log('Magic systems browser journey passed.');
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

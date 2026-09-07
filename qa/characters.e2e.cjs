'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),output=path.join(__dirname,'evidence','characters');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html',file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
});
(async()=>{
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
try{
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>{errors.push(error.message);console.log('Browser error: '+error.stack);});
page.setDefaultTimeout(20000);console.log('Opening isolated local campaign');
await page.route('**/*',route=>{const host=new URL(route.request().url()).hostname;return host==='127.0.0.1'||host.endsWith('googleapis.com')||host.endsWith('gstatic.com')?route.continue():route.abort();});
await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
console.log('Page loaded');
await page.screenshot({path:path.join(output,'00-initial.png'),timeout:15000});
console.log((await page.locator('body').innerText({timeout:10000})).slice(0,1800));
const back=page.getByRole('button',{name:'← К списку героев',exact:true}),newHero=page.getByRole('button',{name:'✠ Новый герой',exact:true});
await back.or(newHero).first().waitFor({timeout:120000});if(await back.isVisible())await back.click();
console.log('Character list ready');
const count=await page.locator('.char-card').count();
await page.getByRole('button',{name:'✠ Новый герой',exact:true}).click();
await page.locator('#creator-name').fill('Эйра Лунная');
await page.locator('#creator-race').selectOption('Эльф');
await page.locator('#creator-subrace').selectOption('Лесной эльф');
await page.locator('#creator-cls').selectOption('Волшебник');
await page.locator('#creator-level').fill('3');await page.locator('#creator-level').press('Tab');
await page.locator('#creator-subcls').selectOption('Школа Воплощения');
await page.locator('#creator-bg').selectOption('Аколит');
await page.locator('#creator-biography').fill('Личная биография Эйры.\nЭтот текст не даёт иммунитет к огню.');
assert.equal(await page.locator('#creator-bg option').count(),25);
await page.screenshot({path:path.join(output,'01-identity.png'),fullPage:true});
await page.getByRole('button',{name:'Далее →',exact:true}).click();
for(const [key,value]of Object.entries({str:8,dex:14,con:13,int:15,wis:12,cha:10})){await page.locator('#creator-ab-'+key).fill(String(value));await page.locator('#creator-ab-'+key).press('Tab');}
await page.screenshot({path:path.join(output,'02-abilities.png'),fullPage:true});
await page.getByRole('button',{name:'Далее →',exact:true}).click();
await page.getByLabel('Анализ',{exact:true}).check();await page.getByLabel('Магия',{exact:true}).check();
await page.locator('#creator-language-0').selectOption('Драконий');await page.locator('#creator-language-1').selectOption('Гномий');
await page.getByRole('button',{name:'Далее →',exact:true}).click();
await page.screenshot({path:path.join(output,'03-review.png'),fullPage:true});
assert.equal(await page.locator('.character-warning').count(),0);
await page.getByRole('button',{name:'Создать героя',exact:true}).click();
await page.locator('#sheet-subclass').waitFor();assert.equal(await page.locator('#sheet-subclass').inputValue(),'Школа Воплощения');
assert.equal(await page.getByText('Точный тег: гитьянки',{exact:true}).count(),0);
assert.equal(await page.getByLabel('Максимальные хиты',{exact:true}).inputValue(),'17');
await page.screenshot({path:path.join(output,'04-sheet.png'),fullPage:true});
await page.getByRole('button',{name:'Предыстория',exact:true}).click();
assert.match(await page.locator('.background-panel .background-description').innerText(),/Опыт духовных традиций/);
assert.match(await page.locator('#character-biography').inputValue(),/Личная биография Эйры/);
await page.getByText('Поступок и вдохновение',{exact:true}).click();
await page.locator('#bg-session').fill('Проверочная сессия');await page.locator('#bg-event-note').fill('Героиня применила знание традиций, чтобы помочь группе.');await page.locator('#bg-confirm-milestone').check();
await page.getByRole('button',{name:'Записать поступок',exact:true}).click();await page.getByRole('button',{name:'На следующий бросок',exact:true}).waitFor({timeout:60000});
await page.locator('#bg-training-choice').selectOption('tool:Инструменты каллиграфа');await page.locator('#bg-mentor').fill('Наставник кампании');await page.locator('#bg-confirm-start-training').check();
await page.getByRole('button',{name:'Начать обучение',exact:true}).click();await page.locator('#bg-training-days').waitFor({timeout:60000});
await page.locator('#bg-confirm-train').check();await page.getByRole('button',{name:'Оплатить и зачесть дни',exact:true}).click();
await page.locator('#bg-development-error:not([hidden])').waitFor({timeout:60000});assert.match(await page.locator('#bg-development-error').innerText(),/Недостаточно монет/);
assert.equal(await page.locator('progress').getAttribute('value'),'0');assert.equal(await page.getByLabel('Максимальные хиты',{exact:true}).inputValue(),'17');
await page.screenshot({path:path.join(output,'06-background.png'),fullPage:true});
await page.locator('#sheet-subrace').selectOption('Высший эльф');assert.equal(await page.getByLabel('Базовая скорость',{exact:true}).inputValue(),'9 м');
await page.getByRole('button',{name:'← К списку героев',exact:true}).click();assert.equal(await page.locator('.char-card').count(),count+1);
await page.locator('#character-search').fill('Эйра');assert.equal(await page.locator('.char-card:visible').count(),1);
await page.getByRole('button',{name:'✠ Новый герой',exact:true}).click();await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await page.locator('.char-card').count(),count+1);
await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'✠ Новый герой',exact:true}).waitFor({timeout:120000});
await page.locator('#character-search').fill('Эйра');await page.locator('.char-card:visible').click();assert.equal(await page.locator('#sheet-subrace').inputValue(),'Высший эльф');
await page.getByRole('button',{name:'Предыстория',exact:true}).click();assert.match(await page.locator('#character-biography').inputValue(),/Личная биография Эйры/);assert.equal(await page.locator('progress').getAttribute('value'),'0');assert.equal(await page.locator('.background-history li').count(),2);
await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'07-background-mobile.png'),fullPage:true});assert.equal(await page.locator('.background-panel').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'← К списку героев',exact:true}).click();await page.getByRole('button',{name:'✠ Новый герой',exact:true}).click();
await page.screenshot({path:path.join(output,'05-mobile.png'),fullPage:true});
assert.equal(await page.locator('.character-creator').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'creator must not scroll horizontally on mobile');
await page.keyboard.press('Escape');assert.equal(await page.locator('#characterCreator').count(),0);
assert.deepEqual(errors,[],'no unhandled browser exceptions');
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,created:'Эйра Лунная',checks:['dependent dropdowns','24 backgrounds','ability assignment','training choices','single creation commit','saved background description','inert biography','milestone inspiration','training course','insufficient funds rollback','development reload','branch effects','search','cancellation','reload','mobile layout','Escape','no browser exceptions']},null,2));console.log('Characters browser journey passed; screenshots: '+output);
}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

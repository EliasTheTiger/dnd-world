'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.');
const output=process.env.QA_ARTIFACT_DIR?path.resolve(process.env.QA_ARTIFACT_DIR,'abilities'):path.join(__dirname,'evidence','abilities');
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
 const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port,origin=new URL(url).origin,browser=await chromium.launch({headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  // Fresh context and external-service blocking isolate even live-site checks from saved campaigns.
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  const release=await page.locator('meta[name="dnd-world-release"]').getAttribute('content');
  if(process.env.QA_EXPECTED_COMMIT)assert.equal(release,process.env.QA_EXPECTED_COMMIT);
  await page.locator('.tab[data-tab="abilitiesdb"]').click();
  const catalog=page.locator('#tab-abilitiesdb'),search=page.getByRole('searchbox',{name:'Поиск способностей'});
  assert.equal(await catalog.locator('.entry-card').count(),40);
  const uniqueness=await page.evaluate(()=>{const groups=abilityCatalogIndex().groups;return {profiles:abilitiesDB.length,abilities:groups.length,names:groups.map(group=>group.name)};});
  assert.equal(new Set(uniqueness.names).size,uniqueness.abilities);assert.ok(uniqueness.abilities<uniqueness.profiles);
  await catalog.getByRole('button',{name:'Далее →',exact:true}).first().click();assert.match(await catalog.innerText(),/страница 2 из/);
  await search.pressSequentially('Grappler');assert.equal(await search.inputValue(),'Grappler');assert.equal(await search.evaluate(el=>el===document.activeElement),true);
  assert.equal(await catalog.locator('.entry-card').count(),1);assert.match(await catalog.innerText(),/Рукопашный борец/);assert.match(await catalog.innerText(),/оба участника становятся обездвиженными/);
  await page.getByRole('combobox',{name:'Редакция способностей'}).selectOption('2024');assert.match(await catalog.innerText(),/D&D 2024 · справочная карточка/);
  await page.getByRole('combobox',{name:'Редакция способностей'}).selectOption('2014');await search.fill('Action Surge');assert.match(await catalog.innerText(),/Порыв к действию/);
  await search.fill('всплеск действий');assert.equal(await catalog.locator('.entry-card').count(),1);
  await page.getByRole('combobox',{name:'Редакция способностей'}).selectOption('');await search.fill('Ночное зрение');
  // Search also finds descriptions mentioning darkvision; the ability's title occurs once.
  assert.equal(await catalog.getByRole('heading',{name:'Ночное зрение',exact:true}).count(),1);
  await search.fill('Second Wind');assert.equal(await catalog.locator('.entry-card').count(),1);
  const newerWind=await page.evaluate(()=>abilitiesDB.find(ab=>ab.open5e?.originalName==='Second Wind'&&ab.catalogSource?.documentKey==='srd-2024').id);
  await catalog.getByRole('combobox',{name:'Вариант правил',exact:true}).selectOption(newerWind);assert.match(await catalog.innerText(),/D&D 2024 · справочная карточка/);
  await page.getByRole('combobox',{name:'Редакция способностей'}).selectOption('campaign');assert.doesNotMatch(await catalog.innerText(),/D&D 2024 · справочная карточка/);
  await page.screenshot({path:path.join(output,'01-catalog-desktop.png'),fullPage:false});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'02-catalog-mobile.png'),fullPage:true});
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true,'ability catalog fits a 390px viewport');
  await page.setViewportSize({width:1440,height:1000});
  // Fixture setup only. Assignment, cancellation and healing below use actual controls.
  const ids=await page.evaluate(()=>{
   const c=Object.assign(buildBlank(),{id:'abilities-qa-fighter',name:'Проверка способностей',cls:'Воин',level:17,hp:3,hpMax:100});c.ab.str=12;
   const source=name=>abilitiesDB.find(ab=>ab.catalogSource?.documentKey==='srd-2014'&&ab.open5e?.originalName===name);
   const wind=source('Second Wind'),surge=source('Action Surge');c.abilities=[{abilityId:wind.id,cur:1,notes:''},{abilityId:surge.id,cur:2,notes:''}];
   chars=[c];activeCharId=c.id;sheetTab='abilities';switchTab('chars');renderChars();return {wind:wind.id,surge:surge.id};
  });
  assert.match(await page.locator('#tab-chars').innerText(),/2 \/ 2/);
  const heroSearch=page.getByPlaceholder('Найти способность в своде мира и вписать герою…');
  await heroSearch.fill('Second Wind');assert.equal(await page.locator('#tab-chars .spell-hit').count(),0,'owned source variants are absent from assignment search');
  await heroSearch.fill('Darkvision');assert.equal(await page.locator('#tab-chars .spell-hit').count(),1);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#tab-chars').getByRole('combobox',{name:'Вариант правил',exact:true}).selectOption('ab_darkvision');
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true,'hero source selector fits a 390px viewport');
  await page.locator('#tab-chars .spell-hit').click();assert.equal(await page.evaluate(()=>getCh('abilities-qa-fighter').abilities.length),3);
  await page.locator('#tab-chars button[onclick="delCharAbility(\'ab_darkvision\')"]').click();
  await page.setViewportSize({width:1440,height:1000});
  await heroSearch.fill('Grappler');await page.locator('#tab-chars .spell-hit').click();
  assert.equal(await page.evaluate(()=>getCh('abilities-qa-fighter').abilities.length),2,'Strength prerequisite blocks assignment');await heroSearch.fill('');
  const wind=page.locator('button[onclick="abilityCastFx(\''+ids.wind+'\',\'abilities-qa-fighter\')"]');
  await wind.click();await page.locator('#castConfirmBtn').click();await page.locator('#cf_heal0').waitFor();
  await page.locator('#castStep3').getByRole('button',{name:'Отмена',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('abilities-qa-fighter');return [c.hp,c.abilities[0].cur];}),[3,1]);
  await wind.click();await page.locator('#castConfirmBtn').click();await page.locator('#cf_heal0').fill('7');
  await page.getByRole('button',{name:'Применить итог',exact:true}).click();await page.locator('#castBack').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('abilities-qa-fighter');return [c.hp,c.abilities[0].cur,c.hpMax];}),[27,0,100]);
  await page.screenshot({path:path.join(output,'03-second-wind.png'),fullPage:false});
  // Simulate a legacy save with a full duplicate next to the spent canonical copy.
  await page.evaluate(()=>{getCh('abilities-qa-fighter').abilities.push({abilityId:'ab_lg_secondwind',cur:1,notes:'Заметка из старой копии'});return runScheduledSave();});await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('abilities-qa-fighter');return [c.hp,c.abilities[0].cur,c.hpMax];}),[27,0,100]);
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('abilities-qa-fighter');return [c.abilities.length,c.abilities[0].notes];}),[2,'Заметка из старой копии']);
  await page.evaluate(()=>runScheduledSave());await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(page.getByRole('button',{name:'← К списку героев',exact:true})).first().waitFor({timeout:120000});
  assert.deepEqual(await page.evaluate(()=>{const c=getCh('abilities-qa-fighter');return [c.abilities.length,c.abilities[0].cur];}),[2,0],'merged assignments stay unique after another save/reload');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify({ok:true,url,release,uniqueness,checks:['catalog pagination','one card per ability across sources','source profile selector keeps editions separate','no alternative assignments for an owned ability','Hobby World names and Grappler contest','2014/2024 filters','English and legacy search without lost focus','390px layout','fighter level-17 charge limit','Strength prerequisite','healing cancellation','player-entered d10 and one charge','no maximum-HP increase','legacy duplicates merge on reload without lost notes or charge refill','migration survives a second reload','no page errors'],errors},null,2));
  console.log('Abilities browser journey passed.');
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}
 finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

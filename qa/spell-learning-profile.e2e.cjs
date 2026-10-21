'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,process.env.QA_SITE_ROOT||'.'),output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','spell-learning-profile'));fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');const file=path.resolve(root,relative||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(30000);
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});
  const ids=await page.evaluate(async()=>{
   const wizard=Object.assign(buildBlank(),{id:'learning-wizard',name:'Книга Арины',cls:'Волшебник',level:3,subcls:'',ab:{str:10,dex:10,con:10,int:16,wis:16,cha:16}}),cleric=Object.assign(buildBlank(),{id:'learning-cleric',name:'Молитвы Миры',cls:'Жрец',subcls:'Домен Жизни',level:3});
   const bard=Object.assign(buildBlank(),{id:'learning-bard',name:'Тайны Лиры',cls:'Бард',subcls:'',level:10});
   chars=[wizard,cleric,bard];for(const c of chars){characterAdopt(c);applyClassSlots(c);upgradeSpellcastingState(c);}activeCharId=wizard.id;sheetTab='spells';switchTab('chars');renderChars();scheduleSave();await runScheduledSave();
   return Object.fromEntries(['Magic Missile','Burning Hands','Detect Magic','Guiding Bolt','Guidance'].map(name=>[name,spellsDB.find(s=>grimoireActive(s)&&GRIMOIRE_RULES.identity(s)===GRIMOIRE_RULES.normalize(name)).id]));
  });
  const profile=page.getByRole('region',{name:'Изучение заклинаний героя'}),learn=profile.getByRole('button',{name:'Изучить и сохранить',exact:true});
  assert.match(await profile.innerText(),/Книга и подготовка/);assert.equal(await page.locator('#campaign-mp-access').count(),0);
  await page.locator('#spell-choice-learn').selectOption(ids['Magic Missile']);await learn.click();await page.waitForFunction(id=>!gameActionInteractionLocked()&&getCh('learning-wizard').spellbook.some(e=>e.spellId===id),ids['Magic Missile']);
  assert.equal(await page.evaluate(id=>spellEntryReady(getCh('learning-wizard'),getCh('learning-wizard').spellbook.find(e=>e.spellId===id),spellOf(id)),ids['Magic Missile']),false);
  checks.push('wizard choice enters the saved book without granting preparation');
  await page.locator('#spell-choice-prepare').selectOption(ids['Magic Missile']);await profile.getByRole('button',{name:'Изменить план и сохранить',exact:true}).click();await page.waitForFunction(()=>!gameActionInteractionLocked());
  assert.equal(await page.evaluate(id=>getCh('learning-wizard').spellbook.find(e=>e.spellId===id).prep,ids['Magic Missile']),false);
  await page.getByRole('button',{name:'☾ Долгий отдых',exact:true}).first().click();assert.equal(await page.evaluate(id=>getCh('learning-wizard').spellbook.find(e=>e.spellId===id).prep,ids['Magic Missile']),true);checks.push('saved preparation takes effect only on long rest');
  const before=await page.evaluate(()=>getCh('learning-wizard').spellbook);
  await page.evaluate(()=>{window.learningOriginalSave=runScheduledSave;runScheduledSave=async()=>false;});
  await page.locator('#spell-choice-learn').selectOption(ids['Burning Hands']);await learn.click();await page.waitForFunction(()=>!gameActionInteractionLocked());assert.match(await page.locator('#saveStatus').innerText(),/Не удалось сохранить/);
  assert.deepEqual(await page.evaluate(()=>getCh('learning-wizard').spellbook),before);await page.evaluate(()=>{runScheduledSave=window.learningOriginalSave;delete window.learningOriginalSave;});checks.push('failed durable save restores book and remaining choices');
  await page.locator('#spell-choice-learn').selectOption(ids['Burning Hands']);await page.evaluate(()=>{getCh('learning-wizard').level=4;});await learn.click();await page.waitForFunction(()=>!gameActionInteractionLocked());assert.match(await page.locator('#saveStatus').innerText(),/Профиль героя изменился/);assert.deepEqual(await page.evaluate(()=>getCh('learning-wizard').spellbook),before);
  await page.evaluate(()=>{getCh('learning-wizard').level=3;renderChars();});checks.push('stale rendered choice cannot apply to a changed hero');
  await page.locator('#sheet-class').selectOption('Воин');assert.match(await profile.innerText(),/Нет классовых заклинаний/);await page.locator('#sheet-class').selectOption('Волшебник');assert.deepEqual(await page.evaluate(()=>getCh('learning-wizard').spellbook),before);checks.push('class round trip restores the learned and prepared book');
  await page.locator('#campaign-magic-mode').selectOption('mp');await page.waitForFunction(()=>!magicSwitchBusy);assert.match(await profile.innerText(),/Книга и подготовка/);assert.equal(await page.locator('#campaign-mp-access').count(),0);checks.push('MP changes payment while class preparation stays automatic');
  await page.setViewportSize({width:320,height:740});await profile.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'wizard-mobile.png')});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,className:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).filter(row=>row.width>0&&(row.left<0||row.right>innerWidth+1)).slice(0,30));fs.writeFileSync(path.join(output,'mobile-overflow.json'),JSON.stringify(overflow,null,2));
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'learning profile fits 320px');
  await page.waitForFunction(()=>!hasUnsavedCampaignChanges());await page.reload({waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});
  await page.locator('.char-card').filter({hasText:'Книга Арины'}).click();await page.getByRole('button',{name:'Заклинания',exact:true}).last().click();assert.deepEqual(await page.evaluate(()=>getCh('learning-wizard').spellbook),before);checks.push('learned book and preparation survive local reload');
  await page.getByRole('button',{name:'← К списку героев',exact:true}).click();await page.locator('.char-card').filter({hasText:'Молитвы Миры'}).click();await page.getByRole('button',{name:'Заклинания',exact:true}).last().click();assert.match(await profile.innerText(),/Подготовка из списка класса/);assert.ok(await page.locator('#spell-choice-prepare option').count()>1);assert.ok(await page.locator('#spell-choice-learn option').count()>1);checks.push('cleric receives full class preparation and separate cantrip choices');
  await page.getByRole('button',{name:'← К списку героев',exact:true}).click();await page.locator('.char-card').filter({hasText:'Тайны Лиры'}).click();await page.getByRole('button',{name:'Заклинания',exact:true}).last().click();
  const bardCounts=()=>page.evaluate(()=>{const c=getCh('learning-bard');return {secrets:c.spellLearning.anyClassChoices,known:knownSpellCount(c),cantrips:cantripKnownCount(c)};});
  const bardBefore=await bardCounts();assert.deepEqual(bardBefore,{secrets:2,known:0,cantrips:0});
  assert.equal(await page.locator('#spell-choice-learn option').evaluateAll((rows,id)=>rows.some(row=>row.value===id),ids.Guidance),false,'a foreign cantrip needs the explicit earned secret choice');
  await page.locator('#spell-choice-secret').selectOption(ids.Guidance);await page.getByRole('button',{name:'Выбрать Тайну магии',exact:true}).click();
  await page.waitForFunction(id=>!gameActionInteractionLocked()&&getCh('learning-bard').spellbook.some(entry=>entry.spellId===id&&entry.anyClassKnown),ids.Guidance);
  const bardAfter=await bardCounts();assert.deepEqual(bardAfter,{secrets:1,known:1,cantrips:0});
  assert.equal(await page.evaluate(id=>{const c=getCh('learning-bard');return spellEntryReady(c,c.spellbook.find(entry=>entry.spellId===id),spellOf(id));},ids.Guidance),true);
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'secret choice fits 320px');
  await page.getByRole('region',{name:'Тайны магии',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'bard-secret-cantrip-mobile.png')});
  await page.waitForFunction(()=>!hasUnsavedCampaignChanges());
  const durableBard=await page.evaluate(async()=>JSON.parse(await store.get(CAMPAIGN_ENVELOPE_KEY)).state.chars.find(c=>c.id==='learning-bard'));
  assert.equal(durableBard.spellLearning.anyClassChoices,1);assert.equal(durableBard.spellbook.find(entry=>entry.spellId===ids.Guidance).anyClassKnown,true);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});assert.deepEqual(await bardCounts(),bardAfter);
  assert.equal(await page.evaluate(id=>{const c=getCh('learning-bard');return spellEntryReady(c,c.spellbook.find(entry=>entry.spellId===id),spellOf(id));},ids.Guidance),true);checks.push('a Bard secret cantrip spends one secret and known-spell choice, preserves ordinary cantrip quota, and survives reload');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,siteRoot:path.relative(repo,root)||'.',checks,errors},null,2));console.log('Personal spell learning browser checks passed ('+checks.length+').');
 }catch(error){if(page)await page.screenshot({path:path.join(output,'failure.png')});throw error;}finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

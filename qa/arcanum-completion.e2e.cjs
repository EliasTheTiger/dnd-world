'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,process.env.QA_SITE_ROOT||'.');
const output=process.env.QA_ARTIFACT_DIR?path.resolve(process.env.QA_ARTIFACT_DIR,'arcanum-completion'):path.join(__dirname,'evidence','arcanum-completion');
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
 if(relative==='favicon.ico'){res.writeHead(204).end();return;}
 const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
  res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.setHeader('cache-control','no-store');fs.createReadStream(file).pipe(res);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port+'/dnd-world/',origin=new URL(url).origin,browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],failedLocal=[],checks=[],dialogs=[],answers=[];
 let release=null;
 const trace=message=>{fs.writeFileSync(path.join(output,'progress.txt'),message);console.log(message);};
 page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)failedLocal.push(response.url());});
 page.on('dialog',async dialog=>{
  const answer=answers.shift(),message=dialog.message();dialogs.push({type:dialog.type(),message,answer:answer?.value});
  if(!answer||!answer.match.test(message)){errors.push('Unexpected dialog: '+message);await dialog.dismiss();return;}
  if(answer.value===null)await dialog.dismiss();else await dialog.accept(typeof answer.value==='function'?answer.value(message):answer.value);
 });
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const respond=(match,value)=>answers.push({match,value});
 const ready=()=>page.waitForFunction(()=>!gameActionInteractionLocked()&&!hasUnsavedCampaignChanges());
 const endTurn=()=>page.getByRole('button',{name:'Завершить ход ▶',exact:true}).click();
 async function fixture(){
  trace('Seed isolated fixture');
  await ready();
  // Only synthetic actors, inventories and encounter setup are installed here.
  // Every spell selection, casting, die result, turn change and retarget below
  // goes through the same visible controls used at the table.
  await page.evaluate(async()=>{
   const c=Object.assign(buildBlank(),{id:'qa-complete',name:'Колдун проверки',cls:'Колдун',subcls:'Исчадие',level:15,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:18}});
   const target=Object.assign(buildBlank(),{id:'qa-target',name:'Первая цель',hp:120,hpMax:120,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saves:{}});
   const other=Object.assign(buildBlank(),{id:'qa-other',name:'Вторая цель',hp:120,hpMax:120,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saves:{},resist:['некротическая энергия']});
   chars=[c,target,other];foesDB=seedFoesDB();const foe=JSON.parse(JSON.stringify(foesDB[0]));foe.id='qa-complete-foe';foe.n='Противник проверки';foesDB.push(foe);combat=blankCombat();fxRound=1;journal=[];
   characterAdopt(c);applyClassSlots(c);upgradeSpellcastingState(c);
   for(const english of ['Circle of Death','True Seeing','Flesh to Stone','Mass Suggestion']){
    const sp=spellsDB.find(s=>grimoireActive(s)&&s.grimoire?.english===english),mat=sp.mechanics.components.material,id='qa-mat-'+sp.id;
    const it={id,n:mat.description,type:'wondrous',custom:true,cost:(mat.cost||1)+' зм',desc:mat.description,tags:['reagent','spellcomponent'],
     material:{component:{matchTokens:mat.matchTokens,valueMode:'fixed',valueGp:mat.cost||1,form:mat.form,exclusiveUses:true,consumedBy:[sp.id]},uses:[sp.id]}};
    upgradeItem(it,true);itemsDB=itemsDB.filter(x=>x.id!==id);itemsDB.push(it);c.inventory.push({id,itemId:id,qty:2});
   }
   for(const [id,n,cost] of [['qa-dirt','Глиняный горшок с кладбищенской землёй',1],['qa-water','Глиняный горшок с солоноватой водой',1],['qa-onyx','Чёрный оникс',150]]){
    const it={id,n,type:'material',cost:cost+' зм',custom:true};upgradeItem(it,true);itemsDB=itemsDB.filter(x=>x.id!==id);itemsDB.push(it);c.inventory.push({id,itemId:id,qty:1,valueGp:cost});
   }
   const corpse=JSON.parse(JSON.stringify(foesDB.find(f=>f.id==='foe_goblin_scout')));Object.assign(corpse,{id:'qa-corpse',n:'Труп проверки',hp:0});foesDB.push(corpse);
   activeCharId=c.id;sheetTab='spells';switchTab('chars');renderChars();fxInvalidate();scheduleSave();await runScheduledSave();
  });
 }
 async function choose(english,circle=6){
  trace('Select '+english);
  const id=await page.evaluate(english=>spellsDB.find(s=>grimoireActive(s)&&s.grimoire?.english===english).id,english);
  await page.locator('#arcanum-choice-'+circle).selectOption(id);await page.getByRole('button',{name:'Выбрать арканум '+circle+' круга',exact:true}).click();
  await page.waitForFunction(({id,circle})=>!gameActionInteractionLocked()&&getCh('qa-complete').mysticArcanum?.choices?.[circle]?.spellId===id,{id,circle});return id;
 }
 async function openCast(circle=6,extra=false,target='ally:qa-target'){
  trace('Open circle '+circle+' cast');
  await page.getByRole('button',{name:'Применить арканум '+circle+' круга',exact:true}).click();await page.locator('#castTarget').selectOption(target);
  if(extra)await page.locator('.cast-multi[value="ally:qa-other"]').check();
  await page.locator('#castConfirmBtn').click();
  if(await page.locator('#castStep2').isVisible())await page.getByRole('button',{name:'Использовать компонент и наложить',exact:true}).click();
 }
 async function fillFormula(save,damage){
  await page.locator('#castStep3').waitFor();
  if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
  if(damage!=null)await page.locator('#cf_dmg0').fill(String(damage));
  if(save!=null)await page.locator('#cf_save').fill(String(save));
  await page.getByRole('button',{name:'Применить итог',exact:true}).click();
 }
 async function castClosed(){await page.locator('#castBack').waitFor({state:'hidden'});await ready();assert.equal(answers.length,0,'all scene questions were asked');}
 async function setupCombat(casterTurn=false){
  trace('Start encounter through UI');
  await page.getByRole('button',{name:'⚔ Бой',exact:true}).click();
  for(const [name,selected,nat] of [['Колдун проверки',casterTurn,20],['Первая цель',!casterTurn,20],['Вторая цель',false,10],['Противник проверки',true,1]]){
   const row=page.locator('.combat-setup-row').filter({hasText:name});await row.locator('input[type="checkbox"]').setChecked(selected);if(selected)await row.locator('input[type="number"]').fill(String(nat));
  }
  await page.getByRole('button',{name:'⚔ Начать бой',exact:true}).click();await page.waitForFunction(key=>combat.active&&combat.turn.actorKey===key,casterTurn?'ally:qa-complete':'ally:qa-target');await ready();
 }
 async function roll(natural){
  trace('Submit repeat d20='+natural);
  await page.locator('#rollBack').waitFor();const inputs=page.locator('#rollRows input[type="number"]');
  for(let i=0;i<await inputs.count();i++){const input=inputs.nth(i);await input.fill(await input.getAttribute('max')==='20'?String(natural):'1');}
  await page.locator('#rollBack').getByRole('button',{name:'Рассчитать и применить',exact:true}).click();await page.waitForFunction(()=>!rollCompleting&&!gameActionInteractionLocked());await ready();
 }
 async function sheet(name){await page.getByRole('button',{name:/Персонажи/,exact:false}).first().click();const back=page.getByRole('button',{name:'← К списку героев',exact:true});if(await back.isVisible())await back.click();await page.locator('.char-card').filter({hasText:name}).click();}
 const pickLabel=label=>message=>{const row=message.split('\n').find(s=>label.test(s));assert.ok(row,'choice is visible: '+label);return row.match(/^\d+/)[0];};
 function suggestionAnswers(hears){
  respond(/^Внушение: одно-два предложения$/,'Охраняй этот мост и предупреждай путников об опасности.');respond(/^Условие начала выполнения/,'');respond(/^Предложение сформулировано разумно/,'да');respond(/^Предложение требует явно вредящего/,'нет');
  respond(/^Заклинатель видит Первая цель/,'да');respond(/^Расстояние до Первая цель, м$/,'5');respond(/^Первая цель слышит внушение/,hears?'да':'нет');respond(/^Первая цель понимает язык внушения/,'да');
 }
 async function summonBite(kind){
  trace('Native attack by '+kind);await page.locator('#tabsNav').getByRole('button',{name:/Противники/}).click();
  const card=page.locator('#tab-foes .card').filter({hasText:'Под контролем заклинателя'});assert.equal(await card.count(),1);assert.equal(await card.getByRole('button',{name:'⚔ Укус',exact:true}).isEnabled(),true);
  await card.getByRole('button',{name:'⚔ Укус',exact:true}).click();await page.locator('#castTarget').selectOption('ally:qa-target');await page.locator('#castConfirmBtn').click();await page.locator('#castStep3').waitFor();
  if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
  const inputs=page.locator('#castStep3 input[id^="cf_"]:visible');for(let i=0;i<await inputs.count();i++){const field=inputs.nth(i),id=await field.getAttribute('id');await field.fill(id.includes('atk')?'15':id.includes('save')?'20':'5');}
  await page.getByRole('button',{name:'Применить итог',exact:true}).click();await castClosed();assert.ok(await page.evaluate(()=>getCh('qa-target').hp<120),'summoned native attack changed target HP');
 }
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});release=await page.locator('meta[name="dnd-world-release"]').getAttribute('content');
  if(process.env.QA_EXPECTED_COMMIT)assert.equal(release,process.env.QA_EXPECTED_COMMIT);
  await fixture();const circle=await choose('Circle of Death');
  respond(/^«Круг смерти»: расстояние до центра сферы, м$/,'40');respond(/^До центра сферы свободен путь/,'да');respond(/^Вы выбрали ВСЕ существа/,'да');
  for(const name of ['Первая цель','Вторая цель']){respond(new RegExp('^'+name+': расстояние до центра сферы, м$'),'5');respond(new RegExp('^'+name+': полное укрытие от центра сферы'),'нет');}
  const beforeCircle=await page.evaluate(()=>({slots:JSON.parse(JSON.stringify(getCh('qa-complete').slots)),mp:magicPool(getCh('qa-complete')).cur}));
  await openCast(6,true);await fillFormula(1,31);await page.waitForFunction(()=>castCtx?.target==='ally:qa-other');assert.equal(await page.locator('#cf_dmg0').inputValue(),'31','the second target reuses the first physical damage roll');await fillFormula(20);await castClosed();
  const circleState=await page.evaluate(circle=>({hp:chars.slice(1).map(c=>c.hp),qty:getCh('qa-complete').inventory.find(e=>e.id==='qa-mat-'+circle).qty,spent:getCh('qa-complete').mysticArcanum.choices[6].spent,slots:getCh('qa-complete').slots,mp:magicPool(getCh('qa-complete')).cur}),circle);
  assert.deepEqual(circleState.hp,[89,113]);assert.equal(circleState.qty,2);assert.equal(circleState.spent,true);assert.deepEqual(circleState.slots,beforeCircle.slots);assert.equal(circleState.mp,beforeCircle.mp);checks.push('Circle of Death: one entered 8d6 total, separate CON saves and resistance, one arcanum, reusable material');
  await fixture();const sight=await choose('True Seeing');respond(/^Первая цель согласен принять «Истинное зрение»/,'да');respond(/^Расстояние для касания цели, м$/,'1');await openCast();await castClosed();
  const sightState=await page.evaluate(id=>({fx:getCh('qa-target').activeFx.find(f=>f.id===id),qty:getCh('qa-complete').inventory.find(e=>e.id==='qa-mat-'+id).qty}),sight);
  assert.equal(sightState.qty,1);assert.equal(sightState.fx.conc,false);assert.equal(sightState.fx.expiresAtRound-sightState.fx.appliedRound,600);assert.ok(sightState.fx.fx.some(f=>f.stat==='vision.true'&&f.value===36.576));checks.push('True Seeing: explicit consent and touch, 25gp ointment once, 120ft vision for one non-concentration hour');
  await fixture();await choose('Power Word Stun',8);await openCast(8);await castClosed();await setupCombat();
  await page.setViewportSize({width:320,height:740});await endTurn();await page.locator('#rollBack').waitFor();assert.match(await page.locator('#rollNote').innerText(),/Телосложение/);assert.equal(await page.locator('#rollBack .cast-modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth;}),true,'repeat-save dialog fits 320px');
  fs.writeFileSync(path.join(output,'mobile-layout.json'),JSON.stringify(await page.evaluate(()=>({width:innerWidth,bodyWidth:document.body.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName,id:el.id,class:el.className,left:r.left,right:r.right,width:r.width,minWidth:s.minWidth,grid:s.gridTemplateColumns};}).filter(r=>r.width&&r.right>innerWidth+1).slice(-80)})),null,2));
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'combat page fits 320px while the repeat save is open');
  await page.screenshot({path:path.join(output,'stun-save-320.png')});await page.locator('#rollBack').getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await page.evaluate(()=>combat.turn.actorKey),'ally:qa-target');
  await endTurn();await roll(1);assert.equal(await page.evaluate(()=>combat.turn.actorKey.startsWith('foe:')),true);assert.equal(await page.evaluate(()=>effectiveConditions(getCh('qa-target')).includes('Ошеломленный')),true);
  await ready();await page.reload({waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});await page.getByRole('button',{name:'⚔ Бой',exact:true}).click();assert.equal(await page.locator('#rollBack').isVisible(),false);assert.equal(await page.evaluate(()=>combat.turn.actorKey.startsWith('foe:')),true);
  await endTurn();await endTurn();await roll(20);assert.equal(await page.evaluate(()=>effectiveConditions(getCh('qa-target')).includes('Ошеломленный')),false);assert.equal(await page.evaluate(()=>getCh('qa-complete').mysticArcanum.choices[8].spent),true);checks.push('Power Word Stun: 320px end-turn request, cancellation, failed save, reload on next actor, successful next save, no resource refund');
  await page.setViewportSize({width:1280,height:900});await fixture();await choose('Flesh to Stone');respond(/^Заклинатель видит Первая цель/,'да');respond(/^Расстояние до Первая цель, м$/,'5');respond(/^Первая цель состоит из плоти/,'да');await openCast();await fillFormula(1);await castClosed();await setupCombat();await endTurn();await roll(1);
  const stone=await page.evaluate(()=>arcanumCastMarkers().find(x=>x.state.spell==='fleshToStone').state.targets.find(t=>t.targetId==='ally:qa-target'));assert.equal(stone.failures,1);assert.equal(stone.successes,0);await sheet('Первая цель');await page.setViewportSize({width:320,height:740});assert.match(await page.locator('.arcanum-controls').innerText(),/провалы 1\/3/);await page.screenshot({path:path.join(output,'petrification-counter-320.png'),fullPage:true});checks.push('Flesh to Stone: repeated CON updates the visible three-success/three-failure counter');
  await fixture();await choose('Eyebite');respond(/^Эффект «Дурного глаза»/,'3');respond(/^Заклинатель видит Первая цель/,'да');respond(/^Расстояние до Первая цель, м$/,'5');await openCast();await fillFormula(1);await castClosed();await sheet('Колдун проверки');
  const retarget=page.getByRole('button',{name:'Дурной глаз: новая цель',exact:true});await retarget.scrollIntoViewIfNeeded();assert.equal(await retarget.isVisible(),true);assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  respond(/^Новая цель «Дурного глаза»/,message=>{const row=message.split('\n').find(s=>/\. Вторая цель$/.test(s));assert.ok(row);return row.match(/^\d+/)[0];});respond(/^Эффект\n/,'3');respond(/^Заклинатель видит цель/,'да');respond(/^Дистанция до цели, м$/,'5');await retarget.click();await roll(1);
  assert.equal(await page.evaluate(()=>arcanumCastMarkers().find(x=>x.state.spell==='eyebite').state.targets.some(t=>t.targetId==='ally:qa-other'&&t.status==='active')),true);assert.equal(await page.evaluate(()=>getCh('qa-complete').mysticArcanum.choices[6].spent),true);await page.screenshot({path:path.join(output,'eyebite-retarget-320.png'),fullPage:true});checks.push('Eyebite: reachable 320px retarget action asks a real WIS roll and applies a second target without another arcanum');
  await page.setViewportSize({width:1280,height:900});await fixture();await choose('Mass Suggestion');suggestionAnswers(false);await openCast();await fillFormula(1);
  await page.waitForFunction(()=>!gameActionInteractionLocked()&&/слышать/.test(document.getElementById('castErr').textContent));assert.equal(await page.evaluate(()=>getCh('qa-complete').mysticArcanum.choices[6].spent),false);await page.locator('#castStep3').getByRole('button',{name:'Отмена',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Применить арканум 6 круга',exact:true}).isEnabled(),true,'cancelled rejected cast immediately permits a corrected retry');
  suggestionAnswers(true);await openCast();await fillFormula(1);await castClosed();await sheet('Первая цель');assert.match(await page.locator('.arcanum-controls').innerText(),/Охраняй этот мост/);await setupCombat();
  const damage=page.locator('.combatant').filter({has:page.locator('#combatHpVal_ally_qa-target')});await damage.locator('input[type="number"]').fill('5');respond(/^Урон Первая цель нанесён заклинателем «Массового внушения» или его спутником\?/,'');await damage.getByRole('button',{name:'− урон',exact:true}).click();await ready();
  assert.equal(await page.evaluate(()=>getCh('qa-target').hp),115);assert.equal(await page.evaluate(()=>arcanumCastMarkers().some(x=>x.state.spell==='massSuggestion'&&x.state.targets.some(t=>t.targetId==='ally:qa-target'&&t.status==='active'))),false);checks.push('Mass Suggestion: unheard order rejected without cost, valid order visible, companion damage ends its effect');
  await fixture();await choose('Conjure Fey');respond(/^Минута непрерывного наложения завершена/,'да');respond(/^Мастер выбирает появляющееся существо/,pickLabel(/\. Волк · опасность/));respond(/^Выбрано видимое свободное место/,'да');respond(/^Бросьте d20 инициативы призванного существа/,'14');await openCast(6,false,'none');await castClosed();
  const fey=await page.evaluate(()=>{const f=foesDB.find(f=>f.arcanumSummon?.kind==='conjureFey');return {round:fxRound,actor:f,spent:getCh('qa-complete').mysticArcanum.choices[6].spent};});assert.equal(fey.round,11);assert.equal(fey.actor.arcanumSummon.initiative.die,14);assert.equal(fey.actor.arcanumSummon.expiresAtRound,611);assert.equal(fey.actor.summonSide,'ally');assert.equal(fey.spent,true);await summonBite('conjureFey');checks.push('Conjure Fey: confirmed minute advances time once, entered initiative, controlled visible summon uses its native Bite');
  await fixture();await choose('Create Undead');respond(/^Минута непрерывного наложения завершена/,'да');respond(/^В игровом мире сейчас ночь/,'да');respond(/^Создание нежити\n/,'1');respond(/^Число целей: от 1 до 3$/,'1');respond(/^Цель 1\n/,pickLabel(/\. Труп проверки$/));respond(/^Труп проверки находится в пределах/,'да');respond(/^Бросьте d20 инициативы гуля 1$/,'12');
  respond(/^Горшок с кладбищенской землёй\n/,pickLabel(/\. Глиняный горшок с кладбищенской землёй ×1$/));respond(/^Горшок с солоноватой водой\n/,pickLabel(/\. Глиняный горшок с солоноватой водой ×1$/));respond(/^Чёрный оникс для цели 1/,pickLabel(/\. Чёрный оникс ×1$/));await openCast(6,false,'none');await castClosed();
  const undead=await page.evaluate(()=>{const f=foesDB.find(f=>f.arcanumSummon?.kind==='createUndead');return {round:fxRound,actor:f,corpse:foeOf('qa-corpse').animatedByCastId,inventory:getCh('qa-complete').inventory.filter(e=>['qa-dirt','qa-water','qa-onyx'].includes(e.id)),concentration:concEntriesOf(getCh('qa-complete')).length};});
  assert.equal(undead.round,11);assert.equal(undead.actor.arcanumSummon.initiative.die,12);assert.equal(undead.actor.arcanumSummon.controlExpiresAtRound,14411);assert.ok(undead.corpse);assert.equal(undead.concentration,0);assert.deepEqual(undead.inventory.map(e=>e.qty),[1,1,1]);await summonBite('createUndead');checks.push('Create Undead: night, minute, actual corpse and three inventory materials; controlled ghoul uses native Bite, components retained');
  await fixture();await choose('Conjure Fey');await setupCombat(true);await sheet('Колдун проверки');await page.locator('.subtabs').getByRole('button',{name:'Заклинания',exact:true}).click();
  respond(/^Мастер выбирает появляющееся существо/,pickLabel(/\. Волк · опасность/));respond(/^Выбрано видимое свободное место/,'да');respond(/^Бросьте d20 инициативы призванного существа/,'14');await openCast(6,false,'none');await castClosed();
  const continuing=()=>page.getByRole('button',{name:'Продолжить наложение: действие',exact:true});
  await page.locator('.subtabs').getByRole('button',{name:'Характеристики',exact:true}).click();assert.match(await continuing().locator('..').innerText(),/1\/10 действий/);assert.equal(await page.evaluate(()=>getCh('qa-complete').mysticArcanum.choices[6].spent),false);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});await sheet('Колдун проверки');assert.match(await continuing().locator('..').innerText(),/1\/10 действий/);await continuing().locator('..').screenshot({path:path.join(output,'long-cast-reload-1-of-10.png')});
  for(let action=2;action<=10;action++){
   trace('Continue combat casting '+action+'/10');await page.getByRole('button',{name:'⚔ Бой',exact:true}).click();await endTurn();await ready();await endTurn();await ready();assert.equal(await page.evaluate(()=>combat.turn.actorKey),'ally:qa-complete');await sheet('Колдун проверки');
   if(action===10)respond(/^Завершить «.*» десятым действием\?/,'');await continuing().click();await ready();
   if(action<10){assert.match(await continuing().locator('..').innerText(),new RegExp(action+'/10 действий'));assert.equal(await page.evaluate(()=>getCh('qa-complete').mysticArcanum.choices[6].spent),false);}
  }
  const completed=await page.evaluate(()=>{const summons=foesDB.filter(f=>f.arcanumSummon?.kind==='conjureFey');return {count:summons.length,die:summons[0]?.arcanumSummon.initiative.die,inCombat:combat.order.some(row=>row.id===summons[0]?.id),spent:getCh('qa-complete').mysticArcanum.choices[6].spent,pending:!!arcanumLongCastEntry('qa-complete')};});
  assert.deepEqual(completed,{count:1,die:14,inCombat:true,spent:true,pending:false});assert.equal(await continuing().count(),0);checks.push('Combat minute casting: visible 1/10 survives reload, next-turn action reaches 2/10, nine continuations complete one paid summon in initiative');
  assert.equal(answers.length,0);assert.deepEqual(errors,[]);assert.deepEqual(failedLocal,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,release,checks,errors,failedLocal,dialogs},null,2));console.log('Arcanum completion browser checks: '+checks.length+' PASS');
 }catch(error){const ui=await page.evaluate(()=>({castError:document.getElementById('castErr')?.textContent,castVerdict:document.getElementById('castVerdict')?.textContent,saveStatus:document.getElementById('saveStatus')?.textContent,rows:castCtx?.spec?.rows})).catch(()=>null);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,release,checks,errors,failedLocal,dialogs,ui,failure:String(error.stack||error)},null,2));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

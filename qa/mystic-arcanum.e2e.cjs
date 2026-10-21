'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,process.env.QA_SITE_ROOT||'.');
const output=process.env.QA_ARTIFACT_DIR?path.resolve(process.env.QA_ARTIFACT_DIR,'mystic-arcanum'):path.join(__dirname,'evidence','mystic-arcanum');
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'');
  if(relative==='favicon.ico'){res.writeHead(204).end();return;}
  const file=path.resolve(root,relative||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}
    res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('cache-control','no-store');fs.createReadStream(file).pipe(res);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.QA_BASE_URL||'http://127.0.0.1:'+server.address().port+'/dnd-world/',origin=new URL(url).origin,browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[],failedLocal=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)failedLocal.push(response.url());});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  async function state(){return page.evaluate(()=>{const c=getCh('qa-arcanum');return {hp:getCh('qa-arcanum-target').hp,spent:!!c.mysticArcanum?.choices?.[7]?.spent,
    spellId:c.mysticArcanum?.choices?.[7]?.spellId,slots:c.slots,mp:magicUsesMp()?magicPool(c).cur:null,known:knownSpellCount(c)};});}
  const castButton=page.getByRole('button',{name:'Применить арканум 7 круга',exact:true});let release=null;
  async function formula(){
    await castButton.click();assert.match(await page.locator('#castResourceLabel').innerText(),/арканум/i);
    assert.match(await page.locator('#castInfo').innerText(),/Оживление.*вручную/);
    await page.locator('#castSlot').selectOption('7:arcanum');await page.locator('#castTarget').selectOption('ally:qa-arcanum-target');
    if(page.viewportSize().width===320){assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'arcanum-resource-mobile.png')});}
    await page.locator('#castConfirmBtn').click();if(await page.locator('#castDistance').isVisible())await page.locator('#castDistance').selectOption('near');
    const damage=page.locator('#cf_dmg0');await damage.waitFor();await damage.fill('7');
    await page.locator('#cf_save').fill('1');
  }
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});
    release=await page.locator('meta[name="dnd-world-release"]').getAttribute('content');
    if(process.env.QA_EXPECTED_COMMIT)assert.equal(release,process.env.QA_EXPECTED_COMMIT,'the tested page must be the expected release');
    // Synthetic actors only; all learning, payment, cancellation, rest and mode changes below use the real UI.
    await page.evaluate(async()=>{
      const c=Object.assign(buildBlank(),{id:'qa-arcanum',name:'Колдун арканума',cls:'Колдун',subcls:'Исчадие',level:13,ab:{str:10,dex:10,con:14,int:10,wis:12,cha:18}}),target=Object.assign(buildBlank(),{id:'qa-arcanum-target',name:'Цель арканума',hp:120,hpMax:120});
      chars=[c,target];characterAdopt(c);applyClassSlots(c);upgradeSpellcastingState(c);activeCharId=c.id;sheetTab='spells';switchTab('chars');renderChars();scheduleSave();await runScheduledSave();
    });
    const before=await state();assert.equal(before.known,0);
    await page.setViewportSize({width:320,height:740});await page.locator('#arcanum-choice-7').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'arcanum choice fits a 320px viewport');
    await page.screenshot({path:path.join(output,'arcanum-choice-mobile.png'),fullPage:true});
    await page.locator('#arcanum-choice-7').selectOption('sp_перст_смерти');await page.getByRole('button',{name:'Выбрать арканум 7 круга',exact:true}).click();
    await page.waitForFunction(()=>!gameActionInteractionLocked()&&getCh('qa-arcanum').mysticArcanum?.choices?.[7]?.spellId==='sp_перст_смерти');
    const selected=await state();assert.equal(selected.known,0);assert.equal(selected.spent,false);checks.push('level 13 selects one seventh-circle arcanum without ordinary known-spell credit');
    await formula();assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true,'arcanum payment and manual dice fit 320px');
    await page.screenshot({path:path.join(output,'arcanum-payment-mobile.png'),fullPage:false});
    await page.locator('#castStep3').getByRole('button',{name:'Отмена',exact:true}).click();assert.deepEqual(await state(),selected);checks.push('cancelled manual cast preserves daily use, target HP and pact slots');
    await page.setViewportSize({width:1280,height:900});await formula();
    await page.evaluate(()=>{window.arcanumOriginalStoreSet=store.set;store.set=async(key,value)=>key===CAMPAIGN_ENVELOPE_KEY?false:window.arcanumOriginalStoreSet(key,value);});
    await page.getByRole('button',{name:'Применить итог',exact:true}).click();
    await page.waitForFunction(()=>!gameActionInteractionLocked()&&/Не удалось сохранить арканум/.test(document.getElementById('castErr').textContent));
    assert.deepEqual(await state(),selected,'the actual failed envelope writer rolls back the real UI cast');
    await page.evaluate(()=>{store.set=window.arcanumOriginalStoreSet;delete window.arcanumOriginalStoreSet;});
    checks.push('durable write rejection restores both target and daily resource');
    if(!await page.locator('#castBack').isVisible())await formula();
    // Two actual click events expose duplicate acceptance before the first durable write completes.
    await page.getByRole('button',{name:'Применить итог',exact:true}).evaluate(button=>{button.click();button.click();});
    await page.waitForFunction(()=>!gameActionInteractionLocked()&&getCh('qa-arcanum').mysticArcanum?.choices?.[7]?.spent===true);
    await page.locator('#castBack').waitFor({state:'hidden'});const first=await state();
    assert.ok(first.hp<selected.hp);assert.equal(first.hp,selected.hp-37,'the entered 7d8 sum is applied once by the existing spell formula');
    assert.deepEqual(first.slots,selected.slots);assert.equal(first.mp,selected.mp);checks.push('retry succeeds once despite a repeated click, without pact-slot payment');
    await page.getByRole('button',{name:'☕ Короткий отдых',exact:true}).first().click();assert.equal((await state()).spent,true);checks.push('short rest does not refresh the daily use');
    await page.locator('#campaign-magic-mode').selectOption('mp');await page.waitForFunction(()=>!magicSwitchBusy&&campaignMagic.mode==='mp');assert.equal((await state()).spent,true);
    await page.getByRole('button',{name:'☾ Долгий отдых',exact:true}).first().click();await page.waitForFunction(()=>getCh('qa-arcanum').mysticArcanum?.choices?.[7]?.spent===false);
    const beforeMp=await state();await formula();await page.getByRole('button',{name:'Применить итог',exact:true}).click();
    await page.waitForFunction(()=>!gameActionInteractionLocked()&&getCh('qa-arcanum').mysticArcanum?.choices?.[7]?.spent===true);
    await page.locator('#castBack').waitFor({state:'hidden'});const afterMp=await state();assert.equal(afterMp.mp,beforeMp.mp);assert.equal(afterMp.hp,beforeMp.hp-37);
    checks.push('long rest refreshes the same choice and its MP-mode cast spends no MP');
    await page.waitForFunction(()=>!hasUnsavedCampaignChanges());
    const durable=await page.evaluate(async()=>JSON.parse(await store.get(CAMPAIGN_ENVELOPE_KEY)));assert.equal(durable.state.chars.find(c=>c.id==='qa-arcanum').mysticArcanum.choices[7].spent,true);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});assert.deepEqual(await state(),afterMp);
    await page.locator('.char-card').filter({hasText:'Колдун арканума'}).click();await page.locator('.subtab').filter({hasText:'Заклинания'}).click();
    assert.equal(await castButton.isDisabled(),true,'reload does not re-enable a spent daily cast');checks.push('daily spending and target consequences survive authoritative save and local reload');
    assert.deepEqual(errors,[]);assert.deepEqual(failedLocal,[]);
    await page.screenshot({path:path.join(output,'arcanum-spent-after-reload.png'),fullPage:true});
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,siteRoot:root,release,checks,errors,failedLocal},null,2));console.log('Mystic Arcanum browser checks: '+checks.length+' PASS');
  }catch(error){fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,release,checks,errors,failedLocal,failure:String(error.stack||error)},null,2));await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..',process.env.QA_SITE_ROOT||'.');
const output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','dialogs'));
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
 const url='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===url?route.continue():route.abort());
 const focused=locator=>locator.evaluate(el=>el===document.activeElement);
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  const back=page.getByRole('button',{name:'← К списку героев',exact:true});
  await page.getByRole('button',{name:'✠ Новый герой',exact:true}).or(back).first().waitFor({timeout:120000});
  if(!await back.isVisible())await page.locator('#tab-chars .char-card').first().click();
  const die=page.getByTitle('Бросить инициативу',{exact:true});
  const bonus=Number((await die.innerText()).replace(/[^+\-\d]/g,''));
  const resultBefore=await page.locator('#diceOut').innerText();
  await die.click();
  const dialog=page.getByRole('dialog',{name:'⚂ Инициатива',exact:true}),input=dialog.getByRole('spinbutton',{name:'d20',exact:true});
  await input.waitFor();await input.focus();
  await input.press('Shift+Tab');assert.equal(await focused(dialog.getByRole('button',{name:'Отмена',exact:true})),true);
  await page.keyboard.press('Tab');assert.equal(await focused(input),true);
  assert.equal(await page.locator('.wrap').evaluate(el=>el.inert),true);checks.push('dialog has name, labeled dice and keyboard focus remains inside');
  await input.fill('21');await dialog.getByRole('button',{name:'Рассчитать и применить'}).click();
  assert.equal(await dialog.isVisible(),true);assert.match(await dialog.getByRole('status').innerText(),/Впишите целые результаты/);checks.push('out-of-range die cannot apply');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await focused(die),true);assert.equal(await page.locator('.wrap').evaluate(el=>el.inert),false);checks.push('Escape cancels and restores originating control');
  assert.equal(await page.locator('#diceOut').innerText(),resultBefore);checks.push('cancelled initiative does not publish an applied result');
  await die.click();await input.fill('17');await dialog.getByRole('button',{name:'Рассчитать и применить'}).click();
  await dialog.waitFor({state:'hidden'});assert.match(await page.locator('#diceOut').innerText(),new RegExp('^Инициатива: d20 17.* = '+(17+bonus)+'$'));checks.push('manual initiative result includes the actual character modifier');
  await back.click();
  const creator=page.getByRole('button',{name:'✠ Новый герой',exact:true});await creator.click();
  const creatorDialog=page.getByRole('dialog',{name:'Создание героя',exact:true});await creatorDialog.waitFor();
  await page.keyboard.press('Escape');await creatorDialog.waitFor({state:'hidden'});assert.equal(await focused(creator),true);checks.push('creator cancellation restores focus without creating a hero');
  await page.locator('#tab-chars .char-card').first().click();
  await page.setViewportSize({width:320,height:740});await die.click();await input.fill('12');
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:path.join(output,'manual-die-mobile.png'),fullPage:false});checks.push('manual dice dialog fits 320px viewport');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,checks,errors},null,2));
  console.log('Dialog keyboard, cancellation, manual dice and mobile checks passed.');
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

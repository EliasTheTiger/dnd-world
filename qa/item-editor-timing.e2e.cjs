'use strict';
// Diagnostic timings, not a CI latency budget. All edits live in a disposable profile.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const root=path.resolve(__dirname,'..'),output=path.join(__dirname,'evidence','item-editor-timing');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true}),events=[],failed=[],errors=[],inFlight=new Map();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);
  page.on('console',message=>{if(message.text().startsWith('EDITOR_TIMING ')){const row=JSON.parse(message.text().slice(14));events.push(row);fs.writeFileSync(path.join(output,'events.json'),JSON.stringify(events,null,2));console.log(message.text());}});
  page.on('request',request=>inFlight.set(request.url(),Date.now()));page.on('requestfinished',request=>inFlight.delete(request.url()));page.on('requestfailed',request=>{inFlight.delete(request.url());if(new URL(request.url()).hostname==='127.0.0.1')failed.push({url:request.url(),error:request.failure()?.errorText});});page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{events.push({dialog:dialog.message()});await dialog.dismiss();});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort('blockedbyclient'));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});
  await page.locator('#itemsTabButton').click();await page.locator('#bg3ReleaseMetrics[data-catalog-state="ready"]').waitFor({timeout:120000});
  await page.evaluate(()=>{const c=buildBlank();c.id='editor-timing-hero';c.name='Проверка редактора';c.inventory=[];chars=[c];activeCharId=c.id;itemWorkspaceSetHero(c.id);});
  await page.locator('#bg3CatalogSearchInput').fill('Кинжал');await page.getByRole('button',{name:'Открыть карточку Кинжал',exact:true}).click();
  await page.locator('#itemWorkspaceDetail').getByRole('button',{name:'✎ изменить',exact:true}).click();await page.locator('#edItDesc').fill('Кинжал проверки времени. Сохранённая запись мастера.');
  await page.evaluate(()=>{
   window.editorTiming={calls:{},longTasks:[],started:0,finished:0};const wrap=(name,fn)=>(...args)=>{const began=performance.now();try{return fn(...args);}finally{const row=editorTiming.calls[name]||(editorTiming.calls[name]={count:0,totalMs:0,maxMs:0});const ms=performance.now()-began;row.count++;row.totalMs+=ms;row.maxMs=Math.max(row.maxMs,ms);}};
   worldDefinitionRepository=wrap('worldDefinitionRepository',worldDefinitionRepository);renderItemsDB=wrap('renderItemsDB',renderItemsDB);renderChars=wrap('renderChars',renderChars);gameItemSave=wrap('gameItemSave',gameItemSave);gameItemDuplicate=wrap('gameItemDuplicate',gameItemDuplicate);itemArsenalReadiness=wrap('itemArsenalReadiness',itemArsenalReadiness);
   const original=saveItemEd;saveItemEd=function(){editorTiming.started=performance.now();console.log('EDITOR_TIMING '+JSON.stringify({phase:'handler-start',at:editorTiming.started}));try{return original();}finally{editorTiming.finished=performance.now();console.log('EDITOR_TIMING '+JSON.stringify({phase:'handler-end',durationMs:editorTiming.finished-editorTiming.started,calls:editorTiming.calls}));}};
   new PerformanceObserver(list=>editorTiming.longTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration})))).observe({type:'longtask',buffered:false});
  });
  const began=Date.now();let clickError=null;try{await page.getByRole('button',{name:'Сохранить предмет',exact:true}).click();}catch(error){clickError=error.message;console.log('Editor click did not complete: '+clickError.split('\n')[0]);}
  const clickMs=Date.now()-began;await page.locator('#edItDesc').waitFor({state:'detached'});
  const timing=await page.evaluate(()=>({...editorTiming,descriptionSaved:itemsDB.some(item=>item.desc==='Кинжал проверки времени. Сохранённая запись мастера.'),status:document.getElementById('saveStatus').textContent,descriptionSearchReady:bg3Catalog.descriptionSearchReady}));
  await page.waitForFunction(()=>!hasUnsavedCampaignChanges());const durableMs=Date.now()-began;
  await page.screenshot({path:path.join(output,'saved.png')});const result={ok:!clickError&&timing.descriptionSaved&&!errors.length&&!failed.length,clickMs,durableMs,clickError,timing,events,errors,failed,inFlight:[...inFlight].map(([url,start])=>({url,ageMs:Date.now()-start})),conditions:'Chromium '+browser.version()+'; localhost source files; clean profile; external hosts deliberately blocked; no throttle; instrumented function times include profiling overhead'};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({clickMs,durableMs,handlerMs:timing.finished-timing.started,calls:timing.calls,inFlight:result.inFlight}));assert.equal(result.ok,true,'editor timing journey failed; inspect recorded phases');
 }catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack||error),events,failed,errors,inFlight:[...inFlight]},null,2));console.error(error);throw error;}finally{await browser.close();server.close();}
})().catch(()=>{process.exitCode=1;});

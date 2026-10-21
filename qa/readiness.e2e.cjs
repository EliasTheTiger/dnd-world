'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright')));}
const repoRoot=path.resolve(__dirname,'..'),root=path.resolve(repoRoot,process.env.QA_SITE_ROOT||'.'),output=path.join(__dirname,'evidence','readiness');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/dnd-world(?:\/|$)/,'/').replace(/^\//,'')||'index.html',file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.setHeader('content-length',stat.size);fs.createReadStream(file).pipe(res);});
});
async function geometry(page,tab){return page.evaluate(tab=>{
 const panel=document.getElementById('tab-'+tab),width=document.documentElement.clientWidth;
 const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).clipPath==='none';
 const clipped=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const css=getComputedStyle(p),r=p.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(css.overflowX)&&r.left>=-1&&r.right<=width+1)return true;}return false;};
 const describe=el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,className:String(el.className).slice(0,100),text:(el.innerText||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').slice(0,90),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};
 const leaks=[...panel.querySelectorAll('*')].filter(el=>{if(!visible(el)||clipped(el))return false;const r=el.getBoundingClientRect();return r.right>width+1||r.left< -1;}).map(describe);
 const images=[...panel.querySelectorAll('img')].filter(visible).map(el=>({src:el.getAttribute('src'),complete:el.complete,naturalWidth:el.naturalWidth,...describe(el)}));
 // The combat shell deliberately extends into the leaf padding with negative margins.
 // Report panel widths, but fail only content that actually escapes the viewport.
 return {documentWidth:document.documentElement.scrollWidth,viewportWidth:width,panelWidth:panel.clientWidth,panelScrollWidth:panel.scrollWidth,overflow:document.documentElement.scrollWidth>width+1||leaks.length>0,leaks:leaks.slice(0,30),images:{count:images.length,broken:images.filter(i=>i.complete&&!i.naturalWidth),oversized:images.filter(i=>i.right>width+1||i.left< -1)}};
 },tab);}
function gameplayProjection(){return chars.map(c=>({id:c.id,name:c.name,level:c.level,xp:c.xp,hp:c.hp,hpMax:c.hpMax,hpTemp:c.hpTemp,hdUsed:c.hdUsed,deaths:c.deaths,coins:c.coins,inventory:c.inventory,slots:c.slots,magicResource:c.magicResource}));}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],failed=[],blocked=[],httpErrors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{const row={url:request.url(),reason:request.failure()?.errorText};if(new URL(request.url()).hostname==='127.0.0.1')failed.push(row);else blocked.push(row);});
  page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).hostname==='127.0.0.1')httpErrors.push({url:response.url(),status:response.status()});});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort('blockedbyclient'));
  const start=Date.now();await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
  const activeNavigation=page.locator('#tabsNav [aria-current="page"]');await activeNavigation.waitFor({timeout:120000});
  if(await activeNavigation.getAttribute('data-tab')!=='chars')await page.locator('#tabsNav [data-tab="chars"]').click();
  const heroName=page.getByLabel('Имя героя',{exact:true});
  if(!await heroName.isVisible()){const card=page.locator('#tab-chars .char-card').first();await card.waitFor();await card.click();}
  await heroName.waitFor();await page.waitForFunction(()=>!hasUnsavedCampaignChanges());
  const startupMs=Date.now()-start,initial=await page.evaluate(gameplayProjection),routes=await page.locator('#tabsNav [data-tab]').evaluateAll(nodes=>nodes.map(node=>node.dataset.tab)),measurements=[];
  assert.deepEqual(routes,['chars','combat','races','classes','spellsdb','itemsdb','chests','merchants','abilitiesdb','foes','rules'],'readiness must cover all 11 sections');
  console.log('Initial character sheet ready in '+startupMs+' ms; checking '+routes.length+' routes at 320px');
  for(const tab of routes){
   const button=page.locator('#tabsNav [data-tab="'+tab+'"]');await button.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   const began=Date.now();await button.click();await page.locator('#tab-'+tab).waitFor({state:'visible'});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const visibleMs=Date.now()-began;
   let networkSettled=true;try{await page.waitForLoadState('networkidle',{timeout:120000});}catch{networkSettled=false;}
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const measured={tab,visibleMs,settledMs:Date.now()-began,networkSettled,...await geometry(page,tab)};
   measurements.push(measured);fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(measurements,null,2));
   await page.screenshot({path:path.join(output,tab+'-320.png')});console.log(tab+': '+visibleMs+' ms; width '+measured.documentWidth+'/'+measured.viewportWidth+(measured.overflow?' OVERFLOW '+JSON.stringify(measured.leaks.slice(0,8)):''));
  }
  const final=await page.evaluate(gameplayProjection),resources=await page.evaluate(()=>{const navigation=performance.getEntriesByType('navigation')[0];const rows=performance.getEntriesByType('resource');return {navigation:{domContentLoadedMs:navigation.domContentLoadedEventEnd,loadMs:navigation.loadEventEnd,transferSize:navigation.transferSize},count:rows.length,transferBytes:rows.reduce((n,r)=>n+r.transferSize,0),largest:rows.filter(r=>new URL(r.name).hostname==='127.0.0.1').sort((a,b)=>b.transferSize-a.transferSize).slice(0,8).map(r=>({path:new URL(r.name).pathname,transferBytes:r.transferSize,durationMs:Math.round(r.duration)}))};});
  const result={ok:!measurements.some(row=>row.overflow||row.images.broken.length||row.images.oversized.length)&&!errors.length&&!failed.length&&!httpErrors.length,siteRoot:path.relative(repoRoot,root)||'.',conditions:{date:new Date().toISOString(),platform:os.platform(),cpus:os.cpus().length,browser:browser.version(),viewport:{width:320,height:740},server:'local HTTP, fresh isolated browser context',siteRoot:path.relative(repoRoot,root)||'.',network:'external hosts deliberately blocked; no CPU/network throttle; system may run concurrent tests'},startupMs,routes:measurements,resources,errors,failed,httpErrors,blockedExternal:blocked,gameplayUnchanged:JSON.stringify(initial)===JSON.stringify(final)};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  assert.equal(result.gameplayUnchanged,true,'navigation must not mutate game resources');assert.equal(result.ok,true,'readiness geometry/resource checks failed; see qa/evidence/readiness/result.json');console.log('All 11 routes fit 320px with no broken local resources or image leaks.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

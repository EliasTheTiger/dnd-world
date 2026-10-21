'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(repo,process.env.QA_SITE_ROOT||'.');
const output=path.resolve(process.env.QA_ARTIFACT_DIR||path.join(__dirname,'evidence','public-shell'));
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
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],checks=[],geometry=[],unpublished=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const idle=()=>page.locator('#actionBusyNotice').waitFor({state:'hidden'});
 try{
  await page.goto(origin+'/dnd-world/',{waitUntil:'domcontentloaded'});
  await page.locator('#tabsNav [aria-current="page"]').waitFor({timeout:120000});await idle();
  const header=page.locator('.masthead');
  assert.equal(await header.locator('.dicebox,#diceNote,#diceOut,#releaseBadge,.subtitle').count(),0);
  assert.equal(await header.getByRole('button').count(),0,'header contains no standalone dice or removed utility actions');
  assert.doesNotMatch(await header.innerText(),/летопис|Предметы вашей|настольная книга|Кости:/i);
  assert.equal(await page.locator('main #diceOut[role="status"]').count(),1,'gameplay roll outcomes retain an accessible output');
  checks.push('header contains the title without standalone dice, subtitle, badge or removed utility buttons');
  await page.locator('[data-tab="combat"]').click();await page.locator('#tab-combat').waitFor({state:'visible'});
  const headings=page.locator('.combat-setup-card h3 small');
  assert.deepEqual(await headings.allTextContents(),['Инициатива: d20 + модификатор','Инициатива: d20 + Ловкость']);
  const row=page.locator('.combat-setup-card').first().locator('.combat-setup-row').first(),roll=row.locator('input[type="number"]'),total=row.locator('b[id^="combatInitTotal_"]');
  await roll.fill('17');const firstTotal=Number(await total.innerText());assert.equal(Number.isFinite(firstTotal),true);
  await roll.fill('18');assert.equal(Number(await total.innerText()),firstTotal+1,'initiative still responds to the supplied natural roll');
  for(const width of [1280,768,375,320]){
   await page.setViewportSize({width,height:900});
   const measured=await headings.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),card=node.closest('.combat-setup-card').getBoundingClientRect(),style=getComputedStyle(node);return {text:node.textContent,left:r.left,right:r.right,cardLeft:card.left,cardRight:card.right,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,overflow:style.overflow,textOverflow:style.textOverflow};}));
   for(const h of measured){assert.ok(h.left>=0&&h.right<=width&&h.left>=h.cardLeft&&h.right<=h.cardRight,JSON.stringify({width,...h}));assert.ok(h.scrollWidth<=h.clientWidth+1);assert.notEqual(h.textOverflow,'ellipsis');}
   assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth),true,'combat setup fits '+width+'px');
   geometry.push({width,headings:measured});await headings.first().evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:path.join(output,'initiative-'+width+'.png')});
  }
  checks.push('complete initiative headings and reactive totals fit 1280, 768, 375 and 320px');
  await page.setViewportSize({width:1280,height:900});
  for(const tab of ['combat','races','classes','spellsdb','itemsdb','chests','merchants','abilitiesdb','foes','rules','chars']){
   await idle();await page.locator('[data-tab="'+tab+'"]').click();const panel=page.locator('#tab-'+tab);await panel.waitFor({state:'visible'});
   assert.equal(await panel.getByRole('button',{name:/аудит|диагност|250 редких/i}).count(),0);
   assert.equal(await panel.locator('a[href*="qa/"],a[href*="tests/"],a[href*="docs/"]').count(),0);
   assert.doesNotMatch(await panel.innerText(),/летопись|летописи|летописях|летописями|летописям|летописей/iu,tab+' must not use the removed system term');
  }
  const back=page.getByRole('button',{name:'← К списку героев',exact:true});
  if(!await back.isVisible())await page.locator('#tab-chars .char-card').first().click();
  await page.locator('#tab-chars .subtabs').getByRole('button',{name:'Заклинания',exact:true}).click();
  assert.equal(await page.locator('#spellPrepAuditBtn,#spellPrepAuditOut,#rareAuditBtn,#rareAuditOut').count(),0);
  assert.equal(await page.locator('#tab-chars').getByRole('button',{name:/аудит|диагност/i}).count(),0);
  assert.doesNotMatch(await page.locator('#saveStatus').innerText(),/летопис/iu);
  checks.push('all 11 main sections contain no audit launchers, diagnostic links or removed system wording');
  if(root!==repo){
   const current=JSON.parse(fs.readFileSync(path.join(repo,'data/bg3/current.json'),'utf8')),folder='data/bg3/'+current.catalogVersion;
   const files=fs.readdirSync(path.join(repo,folder)).filter(name=>/-(?:report|audit)\.(?:json|md|txt)$/i.test(name));
   for(const relative of [...files.map(name=>folder+'/'+name),'tests/merchant-user-harness.html','tests/chest-user-harness.html','tests/economy-user-harness.html','qa/evidence/index.html','docs/qa-wave2-economy.md']){
    assert.equal((await page.request.get(origin+'/dnd-world/'+relative)).status(),404,relative+' must be absent from the release');unpublished.push(relative);
   }
   for(const relative of [folder+'/manifest.json',folder+'/mechanics-coverage.json',folder+'/rule-program-coverage.json',folder+'/source/gold-values.json','data/dnd5e/SRD51-NOTICE.md'])assert.equal((await page.request.get(origin+'/dnd-world/'+relative)).status(),200,relative+' must remain available');
   checks.push('historical audit reports and harnesses return 404; required runtime contracts and attribution remain available');
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,siteRoot:path.relative(repo,root)||'.',checks,geometry,unpublished,errors},null,2));
  console.log('Public shell: '+checks.length+' scenarios passed.');
 }catch(error){await page.screenshot({path:path.join(output,'failure.png')});throw error;}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

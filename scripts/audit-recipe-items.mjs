import fs from 'node:fs';
import domain from './item-domain-model.js';
import surface from './public-item-surface.js';
import {loadRuntimeIntegrationEngine} from '../tests/helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url),read=file=>JSON.parse(fs.readFileSync(new URL(file,root),'utf8'));
const engine=loadRuntimeIntegrationEngine(root,{fetch:async url=>{
 const bytes=fs.readFileSync(new URL(String(url).replace(/^\.\//,''),root));
 return {ok:true,status:200,text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes)};
}});
engine.setState({items:engine.catalogs.items});await engine.itemsApi.load();await engine.recipesApi.load();engine.abilitiesApi.quiet();
const recipes=engine.recipesApi.rows(),references=new Map();
const add=(id,recipe,role,quantity,operation)=>{
 if(!references.has(id))references.set(id,[]);
 references.get(id).push({recipeId:recipe.id,recipeName:recipe.name,role,quantity,operation});
};
for(const recipe of recipes){
 for(const input of recipe.inputs)if(!input.station&&input.operation!=='Dye')for(const id of input.canonicalIds||input.ids)add(id,recipe,'ingredient',input.qty,input.operation);
 for(const id of recipe.resultIds)add(id,recipe,'result',recipe.resultQty,'Create');
 for(const id of recipe.toolIds)add(id,recipe,'tool',1,'Keep');
}
await engine.itemsApi.hydrate([...references.keys()].filter(id=>id.startsWith('bg3:')));
const publicItems=engine.itemsApi.rows(),rows=[];
for(const [id,refs] of references){
 const item=engine.itemsApi.resolve(id),readiness=item&&engine.itemsApi.readiness(item),exact=publicItems.find(row=>row.id===id),
 namesake=!exact&&publicItems.find(row=>surface.itemNameKey(row.name)===surface.itemNameKey(item?.n)),
 icon=item&&engine.itemsApi.icon(item,40).match(/<img[^>]+src="([^"]+)"/)?.[1],issues=[];
 if(!item)issues.push('definition-missing');
 const schemaErrors=readiness?.item?domain.validateItemDomainV7(readiness.item):['definition-missing'];
 if(schemaErrors.length)issues.push('domain-invalid');
 if(!icon||!fs.existsSync(new URL(icon,root)))issues.push('illustration-missing');
 if(!exact)issues.push(namesake?'different-public-definition':'public-definition-missing');
 if(readiness&&!readiness.ok)issues.push(...readiness.issues);
 const runtime=[];
 if(item?.recipeTabletop){
  const profile=engine.tabletopApi.profile(item);
  if(!profile||item.rules?.edition!=='5e-2014'||item.rules?.sourceStats!==item.recipeTabletop||!item.rules?.revision)runtime.push({kind:'tabletop',reason:'missing reviewed rules or provenance'});
  for(const use of engine.itemUsesOf(item))if(!profile?.actions?.some(action=>action.id===use.id&&action.recipeRule===use.recipeRule))runtime.push({kind:'tabletop',reason:'unregistered native action '+use.id});
 }
 if(item?.mechanics?.profile?.weapon){
  const actor=engine.buildBlank();actor.id='recipe-audit';actor.inventory=[{id:'tested-item',itemId:id,qty:1}];actor.equipment={MAIN_HAND:'tested-item'};actor.bg3Tags=[];
  engine.setState({items:engine.catalogs.items,chars:[actor],activeCharId:actor.id});
  const prepared=await engine.itemsApi.prepareActor(actor,'tested-item','weapon');
  if(!prepared.ok)runtime.push({kind:'equipment',reason:prepared.reason});
  for(const row of prepared.state?.rows||prepared.rows||[])if(['blocked','granted-action-blocked'].includes(row.status))runtime.push({kind:row.gate,rule:row.bg3Id,reason:row.reason});
 }
 for(const use of item?engine.itemUsesOf(item):[]){
  if(use.handler!=='bg3RuleProgram')continue;
  try{await engine.itemsApi.prepare(use);const plan=engine.itemsApi.plan(use);if(!plan?.ok)runtime.push({kind:'use',action:use.id,issues:plan?.issues||['program-not-prepared']});}
  catch(error){runtime.push({kind:'use',action:use.id,reason:String(error.message||error)});}
 }
 if(runtime.length)issues.push('runtime-preflight-incomplete');
 rows.push({id,name:item?.n||'',statsId:item?.recipeTabletop||item?.source?.statsId||'',publicItemId:exact?.id||null,namesakeId:namesake?.id||null,
  description:item?.desc||'',icon:icon||null,roles:[...new Set(refs.map(row=>row.role))],references:refs,
  schemaErrors,issues:[...new Set(issues)],runtime});
}
rows.sort((a,b)=>a.id.localeCompare(b.id));
const report={schemaVersion:1,catalogVersion:read('data/bg3/current.json').catalogVersion,
 checkScope:'Every canonical ingredient, reusable tool and created item. Dye targets retain their existing item identity; runtime checks are preflight, not proof of every gameplay consequence.',
 counts:{recipes:recipes.length,items:rows.length,missingDefinitions:rows.filter(row=>row.issues.includes('definition-missing')).length,
  invalidDomains:rows.filter(row=>row.schemaErrors.length).length,missingIllustrations:rows.filter(row=>row.issues.includes('illustration-missing')).length,
  exactPublicItems:rows.filter(row=>row.publicItemId).length,itemsNeedingWork:rows.filter(row=>row.issues.length).length},items:rows};
const file=new URL('docs/recipe-item-audit.json',root),content=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw new Error('Recipe item audit is stale.');}
else fs.writeFileSync(file,content);
console.log(JSON.stringify(report.counts));

import fs from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import rules from './recipe-rules.js';
import tabletop from './recipe-tabletop-items.js';
import {loadRuntimeIntegrationEngine} from '../tests/helpers/runtime-catalog-loader.mjs';

const root=new URL('../',import.meta.url);
const read=path=>JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const pointer=read('data/bg3/current.json'),base='data/bg3/'+pointer.catalogVersion+'/',manifest=read(base+'manifest.json');
const items=manifest.files.items.flatMap(file=>read(file.path).items),byId=new Map(items.map(item=>[item.id,item]));
const engine=loadRuntimeIntegrationEngine(root,{fetch:async url=>{const bytes=fs.readFileSync(new URL(String(url).replace(/^\.\//,''),root));return {ok:true,status:200,text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes)};}});
engine.setState({items:engine.catalogs.items});const asset=await engine.recipesApi.load();
for(const item of engine.catalogs.items)if(!byId.has(item.id))byId.set(item.id,item);
const portable=item=>item&&['playable','duplicate'].includes(item.source?.classification)&&item.mechanics?.profile?.flags?.portable!==false&&['pickable','movable'].every(key=>item.mechanics?.sourceFacts?.facts?.[key]?.value!==false)&&!/^BASE_/.test(item.source?.statsId||'');
const primary=item=>(item.source?.identityEvidence?.standard||[]).includes('stats.rootTemplate');
const nameKey=name=>String(name||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').trim();
// These three source meshes have the same name, description, weight, value,
// crafting actions and category. They are inventory-compatible appearances.
const partStats=new Set(['OBJ_AutomatonPart','OBJ_AutomatonPart_B','OBJ_AutomatonPart_C']);
const partSignature=item=>JSON.stringify([item.n,item.desc,item.mechanics.profile.mass.kg,item.mechanics.profile.value.cp,item.mechanics.profile.flags,
 item.mechanics.actions.map(action=>[action.handler,action.special]),item.mechanics.interactions]);
const parts=items.filter(item=>partStats.has(item.source?.statsId)&&primary(item)&&portable(item));
if(parts.length!==3||new Set(parts.map(partSignature)).size!==1)throw new Error('Construct part equivalence requires review.');
const ingredientKey=item=>partStats.has(item.source.statsId)?'OBJ_AutomatonPart':item.source.statsId||'';
// Generated identities must not depend on the host's language or ICU version.
const compareId=(a,b)=>a<b?-1:a>b?1:0;
const rank=(a,b)=>Number(primary(b))-Number(primary(a))||Number(a.source.classification==='duplicate')-Number(b.source.classification==='duplicate')||compareId(a.id,b.id);
const records={},itemRefs=new Map(),excluded=[];
const add=(id,recipe,role)=>{if(!itemRefs.has(id))itemRefs.set(id,[]);itemRefs.get(id).push({recipe,role});};
for(const recipe of asset.recipes){
 if(rules.scope(recipe).kind!=='recipe')continue;
 const inputs=recipe.inputs.map(input=>{
  const station=input.transform==='None'&&(/:QUEST_FOR_Sussur/.test(recipe.id)||['QUEST_DEN_ApprenticeAntidote','MOO_BalthazarLab_Circle','UNI_LOW_SteelWatchFoundry_WatcherHarpoonCrossbow','UNI_LOW_BaldursMouth_LoadPrinter'].some(id=>recipe.id.endsWith(':'+id)));
  if(station)return {slot:input.slot,ids:input.candidateIds.slice(),aliases:[],station:true};
  const valid=input.candidateIds.map(id=>byId.get(id)).filter(portable),groups=new Map();
  for(const item of valid){const key=ingredientKey(item)+(input.transform==='Dye'?'|'+nameKey(item.n):'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  const native=input.type==='Object'&&(tabletop.byStats[input.symbol]||rules.TABLETOP_INGREDIENTS[input.symbol]);
  if(native&&!byId.has(native))throw new Error('Missing tabletop ingredient: '+native);
  const ids=native?[native]:[...new Set([...groups.values()].map(rows=>rows.sort(rank)[0]).sort(rank).map(item=>tabletop.aliases[item.id]||item.id))];
  const aliases=valid.map(item=>item.id).filter(id=>!ids.includes(id));
  for(const id of input.candidateIds)if(!valid.some(item=>item.id===id))excluded.push({recipe:recipe.id,slot:input.slot,id,reason:'not-a-portable-game-item'});
  for(const id of ids)add(id,recipe.id,input.transform==='Dye'?'dye-target':'ingredient');
  return {slot:input.slot,ids,aliases};
 });
 let resultIds=[];
 if(!recipe.dye){
  const candidates=recipe.result.candidateIds.map(id=>byId.get(id)).filter(portable).sort(rank);
  const exact=candidates.filter(primary);
  // A stats result creates its declared root template, never every object
  // sharing that stats record (e.g. fire bottles, caltrops and spore bags).
  const chosen=exact.length?exact:candidates;
  if(!chosen.length)throw new Error('Recipe has no portable result: '+recipe.id);
  const stats=new Set(chosen.map(item=>item.source.statsId));
  if(stats.size!==1)throw new Error('Result requires an explicit identity decision: '+recipe.id);
  resultIds=[rules.TABLETOP_RESULTS[recipe.id]||tabletop.aliases[chosen[0].id]||chosen[0].id];
  if(!byId.has(resultIds[0]))throw new Error('Missing game result: '+resultIds[0]);
  add(resultIds[0],recipe.id,'result');
  for(const id of recipe.result.candidateIds)if(!resultIds.includes(id))excluded.push({recipe:recipe.id,id,reason:rules.TABLETOP_RESULTS[recipe.id]?'tabletop-game-result':'not-the-declared-result-template'});
 }
 records[recipe.id]={inputs,resultIds};
}
const linkedItems=[...itemRefs].sort(([a],[b])=>compareId(a,b)).map(([id,refs])=>({id,statsId:byId.get(id).source?.statsId||'',name:byId.get(id).n.trim(),roles:[...new Set(refs.map(row=>row.role))].sort(),recipes:[...new Set(refs.map(row=>row.recipe))].sort()}));
const data={schemaVersion:1,sourceVersion:pointer.catalogVersion,recipes:records,items:linkedItems};
// Armor choices and recipe membership repeat across many dye formulas. Store
// each string list once in the download, then give each consumer its own copy.
const pools=[],poolIds=new Map();
const encode=value=>{
 if(Array.isArray(value)){
  if(value.length>1&&value.every(row=>typeof row==='string')){const key=JSON.stringify(value);if(!poolIds.has(key)){poolIds.set(key,pools.length);pools.push(value);}return 'p['+poolIds.get(key)+'].slice()';}
  return '['+value.map(encode).join(',')+']';
 }
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([key,row])=>JSON.stringify(key)+':'+encode(row)).join(',')+'}';
 return JSON.stringify(value);
};
const packed=encode(data);
const text='// Generated by scripts/build-recipe-item-links.mjs from exact item and recipe identities.\n(function(root){const p='+JSON.stringify(pools)+';const data='+packed+';if(typeof module===\'object\'&&module.exports)module.exports=data;if(root)root.DndRecipeItemLinks=data;})(typeof globalThis===\'object\'?globalThis:this);\n';
const sandbox={module:{exports:{}}};vm.runInNewContext(text,sandbox);
if(JSON.stringify(sandbox.module.exports)!==JSON.stringify(data))throw new Error('Recipe link packing changed identities or ordering.');
const output=new URL('scripts/recipe-item-links.js',root),audit=new URL('docs/recipe-item-link-decisions.json',root),auditText=JSON.stringify({schemaVersion:1,sourceVersion:pointer.catalogVersion,counts:{recipes:Object.keys(records).length,items:linkedItems.length,excludedAlternatives:excluded.length},items:linkedItems,excluded},null,2)+'\n';
for(const [file,content] of [[output,text],[audit,auditText]]){if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw new Error('Recipe item links are stale: '+file.pathname);}else fs.writeFileSync(file,content);}
console.log(JSON.stringify({recipes:Object.keys(records).length,items:linkedItems.length,excludedAlternatives:excluded.length,sha256:createHash('sha256').update(text).digest('hex')}));

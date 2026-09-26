import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadRuntimeIntegrationEngine} from '../tests/helpers/runtime-catalog-loader.mjs';
const root=new URL('../',import.meta.url);
export const technicalItemText=/(?:Игровые возможности|типизирован|движ(?:ок|к)|обработчик|schemaVersion|manualNote|исполняем(?:ая|ые|ых).*операц|структурированн|полный контракт|идентификатор:|источник правил|атомарн|при коммите|CC-BY|Open5e|\b(?:poison|inhaled|forcedRetreat|handler|runtime|commitFromItemAction|invokeStatusProgram|undefined|NaN)\b|<LSTag|\b(?:alchemy|crafting)\.[a-z]+|\[(?:не заполнено|\d+)\])/iu;
export const visibleText=html=>{
 const source=String(html),labels=[...source.matchAll(/\b(?:title|aria-label|alt)="([^"]*)"/g)].map(m=>m[1]);
 return (source.replace(/<[^>]*>/g,' ')+' '+labels.join(' ')).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#39;/g,"'");
};
export async function auditItemPlayerCards(){
 const e=loadRuntimeIntegrationEngine(root,{fetch:async url=>{const bytes=fs.readFileSync(new URL(String(url).replace(/^\.\//,''),root));return {ok:true,status:200,text:async()=>bytes.toString(),json:async()=>JSON.parse(bytes)};}});
 e.setState({items:e.catalogs.items,spells:e.catalogs.spells});await e.itemsApi.load();await e.itemsApi.audit();const legacyRows=e.itemsApi.rows();await e.itemsApi.initializeSpells();const visible=e.itemsApi.rows(),visibleIds=new Set(visible.map(r=>r.id)),rows=visible.concat(legacyRows.filter(r=>!visibleIds.has(r.id)));await e.itemsApi.hydrate(rows.filter(r=>r.id.startsWith('bg3:')).map(r=>r.id));
 const actor=e.buildBlank();actor.id='item-presentation-audit';actor.name='Следопыт';actor.inventory=[];
 e.setState({...e.state(),chars:[actor],activeCharId:actor.id});
 const records=[],issues=[];
 for(const row of rows){
  const it=e.itemsApi.resolve(row.id),technicalNotes={description:it.desc||'',properties:it.props||'',manualNote:it.manualNote||'',mechanicsNote:it.mechanics?.manualNote||'',source:it.mechanics?.provenance||null};
  actor.inventory=[{id:'audit-entry',itemId:it.id,qty:1,notes:'Найдено в сундуке'}];
  const actorBefore=JSON.stringify(actor),before=JSON.stringify(it.mechanics),list=e.itemsApi.list(row,false),html=e.itemsApi.card(it,'',{fullDescription:true}),model=e.itemsApi.playerModel(it);
  const inventory=e.itemsApi.inventoryHTML(actor),equipment=e.itemsApi.equipmentDetails(it),body=e.itemsApi.body(it,model,actor.id,'audit-entry');
  await e.itemsApi.instructions(it.id,actor.id,'audit-entry','');const instructions=e.elementText('showBody'),after=JSON.stringify(it.mechanics),text=visibleText(html+list+inventory+equipment);
  if(before!==after)issues.push({id:it.id,problem:'Reading rules mutated mechanics'});
  if(actorBefore!==JSON.stringify(actor))issues.push({id:it.id,problem:'Reading inventory changed the hero'});
  if(!inventory.includes(body)||!equipment.includes(e.itemsApi.body(it)))issues.push({id:it.id,problem:'Inventory/equipment lost gameplay content'});
  if(technicalItemText.test(text)||technicalItemText.test(instructions))issues.push({id:it.id,problem:'Technical text',matches:[text.match(technicalItemText)?.[0],instructions.match(technicalItemText)?.[0]]});
  if(!model.name||!(model.description||model.gameplayDescription))issues.push({id:it.id,problem:'Missing name or description'});
  if(!html.includes('<img '))issues.push({id:it.id,problem:'Missing illustration'});
  const mechanicsSha256=crypto.createHash('sha256').update(before).digest('hex');
  // Engineering notes live only in docs/. The Pages build uses an allow-list
  // and never copies this audit or its authoring sources into the website.
  records.push({id:it.id,visible:visibleIds.has(it.id),name:model.name,kind:row.kind,mechanicsSha256,technicalNotes,player:{...model,instructions},checks:{card:true,inventory:true,equipment:true,fullRules:true,illustration:true,readOnly:before===after&&actorBefore===JSON.stringify(actor)}});
 }
 records.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {schemaVersion:2,count:rows.length,visibleCount:visible.length,legacyCount:rows.length-visible.length,issues,records};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const audit=await auditItemPlayerCards();
 if(process.argv.includes('--write'))fs.writeFileSync(new URL('docs/item-cards/all-items-audit.json',root),JSON.stringify(audit)+'\n');
 console.log(JSON.stringify({count:audit.count,visibleCount:audit.visibleCount,legacyCount:audit.legacyCount,issues:audit.issues},null,2));if(audit.issues.length)process.exitCode=1;
}

import fs from 'node:fs';
import {loadRuntimeIntegrationEngine} from '../tests/helpers/runtime-catalog-loader.mjs';
const e=loadRuntimeIntegrationEngine(),rows=e.catalogs.spells;
const normalize=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
const groupBy=(records,key)=>{const groups=new Map();for(const row of records){const k=key(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}return [...groups].map(([key,records])=>({key,records}));};
const active=rows.filter(e.grimoireApi.rules.active);
const summaries=list=>list.map(row=>({id:row.id,name:row.n,english:row.open5e?.originalName,level:row.l,source:row.catalogSource?.documentKey||'local',classes:row.c,mode:row.mechanics?.mode}));
const report={schemaVersion:'grimoire-audit/1',...e.grimoireApi.rules.audit(rows),total:rows.length,
  activeSources:groupBy(active,row=>row.catalogSource?.documentKey||'local-phb-2014').map(group=>({source:group.key,count:group.records.length})),
  repeatedNames:groupBy(active,row=>normalize(row.n)).filter(group=>group.records.length>1).map(group=>({name:group.key,records:summaries(group.records)})),
  repeatedOriginals:groupBy(active,row=>e.grimoireApi.rules.identity(row)).filter(group=>group.records.length>1).map(group=>({name:group.key,records:summaries(group.records)})),
  translations:groupBy(active,row=>row.grimoire?.translation||'unreviewed').map(group=>({status:group.key,count:group.records.length})),
  canonicalNames:summaries(active),
  classLabels:groupBy(active,row=>row.c).map(group=>({label:group.key,count:group.records.length})),
  pendingOfficialRussianSource:true};
fs.mkdirSync('qa/evidence/grimoire',{recursive:true});fs.writeFileSync('qa/evidence/grimoire/after.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({total:report.total,active:report.active,aliases:report.aliases,archive:report.archive,activeSources:report.activeSources,translations:report.translations,repeatedNameGroups:report.repeatedNames.length,repeatedOriginalGroups:report.repeatedOriginals.length,errors:report.errors},null,2));
if(report.errors.length||report.repeatedNames.length||report.repeatedOriginals.length)process.exitCode=1;

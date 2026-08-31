(function catalogGovernanceModule(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.DndWorldCatalogs=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function catalogGovernanceFactory(){
  'use strict';
  const MANIFEST_SCHEMA='dnd-world-catalog-source-manifest/1';
  function ids(definitions){return (definitions||[]).map(row=>String(row&&row.id||'')).filter(Boolean);}
  function duplicates(values){const seen=new Set(),out=new Set();for(const value of values){if(seen.has(value))out.add(value);seen.add(value);}return [...out].sort();}
  function completeness(catalog,definitions,options){
    options=options||{};const actualIds=ids(definitions),duplicateIds=duplicates(actualIds),expected=catalog&&catalog.expected||{mode:'unknown'},missing=[],unexpected=[];
    if(expected.mode==='closed-set'){const expectedIds=(expected.ids||[]).map(String),actual=new Set(actualIds),wanted=new Set(expectedIds);for(const id of expectedIds)if(!actual.has(id))missing.push(id);for(const id of actualIds)if(!wanted.has(id))unexpected.push(id);}
    const countMatches=expected.mode==='count-only'?actualIds.length===Number(expected.count):expected.mode==='closed-set'?missing.length===0&&unexpected.length===0:false;
    const executableMissing=[];if(typeof options.isExecutable==='function')for(const row of definitions||[])if(!options.isExecutable(row))executableMissing.push(String(row&&row.id||''));
    const verifiable=expected.mode==='closed-set'||expected.mode==='count-only',complete=verifiable&&countMatches&&!duplicateIds.length&&!executableMissing.length;
    return {catalogId:String(catalog&&catalog.id||''),domain:String(catalog&&catalog.domain||''),status:complete?'complete':verifiable?'incomplete':'unverifiable',complete,expectedMode:expected.mode,actualCount:actualIds.length,expectedCount:expected.mode==='count-only'?Number(expected.count):expected.mode==='closed-set'?(expected.ids||[]).length:null,duplicateIds,missing,unexpected,executableMissing};
  }
  function validateSource(source){if(!source)return {ok:false,code:'SOURCE_NOT_DECLARED'};if(source.approved!==true)return {ok:false,code:'SOURCE_NOT_APPROVED'};if(!source.rulesetRef)return {ok:false,code:'SOURCE_RULESET_MISSING'};if(!String(source.licenseStatus||'').startsWith('approved'))return {ok:false,code:'SOURCE_LICENSE_NOT_APPROVED'};return {ok:true};}
  function planImport(catalog,source,definitions,options){const sourceCheck=validateSource(source);if(!sourceCheck.ok)return sourceCheck;const report=completeness(catalog,definitions,options);if(report.duplicateIds.length)return {ok:false,code:'DUPLICATE_DEFINITION_IDS',report};if(report.status==='unverifiable')return {ok:false,code:'COMPLETENESS_UNVERIFIABLE',report};if(!report.complete)return {ok:false,code:'CATALOG_INCOMPLETE',report};return {ok:true,catalogId:catalog.id,sourceId:source.id,rulesetRef:source.rulesetRef,definitions:(definitions||[]).slice(),report};}
  return Object.freeze({MANIFEST_SCHEMA,ids,duplicates,completeness,validateSource,planImport});
});

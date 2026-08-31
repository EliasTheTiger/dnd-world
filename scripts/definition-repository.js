(function definitionRepositoryModule(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DndWorldDefinitions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function definitionRepositoryFactory(){
  'use strict';
  const SCHEMA='dnd-world-definition-record/1';
  function copy(value){return JSON.parse(JSON.stringify(value));}
  function definitionKey(kind,id){kind=String(kind||'').trim();id=String(id||'').trim();if(!kind||!id)throw Object.assign(new Error('Definition kind and id are required.'),{code:'INVALID_DEFINITION_ID'});return kind+':'+id;}
  class DefinitionRepository{
    constructor(options){options=options||{};this.rulesets=options.rulesets||null;this.activeRulesetRefs=options.activeRulesetRefs||[];this.layers=new Map();this.index=new Map();}
    replaceLayer(layer,records,options){
      layer=String(layer||'').trim();if(!layer)throw Object.assign(new Error('Layer id is required.'),{code:'INVALID_LAYER'});options=options||{};
      const normalized=[];
      for(const input of records||[]){const kind=String(input&&input.kind||options.kind||'').trim(),value=input&&Object.prototype.hasOwnProperty.call(input,'definition')?input.definition:input,id=String(value&&value.id||'').trim(),key=definitionKey(kind,id),rulesetRef=value.rulesetRef||options.defaultRulesetRef||null;
        normalized.push({schemaVersion:SCHEMA,key,kind,id,layer,priority:Number(options.priority)||0,rulesetRef:rulesetRef&&copy(rulesetRef),definition:value});}
      this.layers.set(layer,normalized);this.rebuild();return normalized.length;
    }
    rebuild(){this.index.clear();const ordered=[...this.layers.values()].flat().sort((a,b)=>a.priority-b.priority||a.layer.localeCompare(b.layer)||a.key.localeCompare(b.key));for(const row of ordered){const previous=this.index.get(row.key);if(previous&&previous.priority===row.priority)throw Object.assign(new Error('Ambiguous definition '+row.key+' in '+previous.layer+' and '+row.layer+'.'),{code:'DUPLICATE_DEFINITION',key:row.key});this.index.set(row.key,row);}}
    record(kind,id){return this.index.get(definitionKey(kind,id))||null;}
    get(kind,id){const row=this.record(kind,id);return row?row.definition:null;}
    require(kind,id){const row=this.record(kind,id);if(!row)throw Object.assign(new Error('Missing definition '+definitionKey(kind,id)+'.'),{code:'MISSING_DEFINITION',kind,id});return row.definition;}
    validateRulesets(){const failures=[];if(!this.rulesets)return {ok:false,code:'RULESET_REGISTRY_MISSING',failures:[{reason:'Ruleset registry is not configured.'}]};for(const row of this.index.values()){const result=this.rulesets.checkDefinition({id:row.id,rulesetRef:row.rulesetRef},this.activeRulesetRefs);if(!result.ok)failures.push({key:row.key,layer:row.layer,code:result.code,reason:result.reason});}return {ok:failures.length===0,failures};}
    auditReferences(references){const missing=[];for(const ref of references||[]){if(!ref||ref.id==null)continue;const kind=String(ref.kind||''),id=String(ref.id),owner=String(ref.owner||'');if(!this.get(kind,id))missing.push({owner,kind,id,code:'MISSING_DEFINITION'});}return {ok:missing.length===0,missing};}
    entries(){return [...this.index.values()].map(row=>({schemaVersion:row.schemaVersion,key:row.key,kind:row.kind,id:row.id,layer:row.layer,priority:row.priority,rulesetRef:copy(row.rulesetRef)}));}
  }
  return Object.freeze({SCHEMA,definitionKey,DefinitionRepository});
});

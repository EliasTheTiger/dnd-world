(function rulesetRegistryModule(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DndWorldRulesets=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function rulesetRegistryFactory(){
  'use strict';
  const MANIFEST_SCHEMA='dnd-world-ruleset-manifest/1',REF_SCHEMA='dnd-world-ruleset-ref/1';
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function normalizeRef(value){
    if(!value||typeof value!=='object')throw Object.assign(new Error('Ruleset reference must be an object.'),{code:'INVALID_RULESET_REF'});
    const id=String(value.id||'').trim(),version=String(value.version||'').trim(),profile=String(value.profile||'').trim();
    if(!id||!version)throw Object.assign(new Error('Ruleset reference needs id and version.'),{code:'INVALID_RULESET_REF'});
    return Object.freeze({schemaVersion:REF_SCHEMA,id,version,...(profile?{profile}:{})});
  }
  function keyOf(ref){ref=normalizeRef(ref);return ref.id+'@'+ref.version+(ref.profile?':'+ref.profile:'');}
  class RulesetRegistry{
    constructor(manifest){
      if(!manifest||manifest.schemaVersion!==MANIFEST_SCHEMA||!Array.isArray(manifest.rulesets))throw Object.assign(new Error('Unsupported ruleset manifest.'),{code:'INVALID_RULESET_MANIFEST'});
      this.manifest=clone(manifest);this.byKey=new Map();
      for(const row of this.manifest.rulesets){const ref=normalizeRef(row),key=keyOf(ref);if(this.byKey.has(key))throw Object.assign(new Error('Duplicate ruleset '+key+'.'),{code:'DUPLICATE_RULESET'});this.byKey.set(key,Object.freeze(clone(row)));}
    }
    get(ref){return this.byKey.get(keyOf(ref))||null;}
    resolve(refs){
      const ordered=[],seen=new Set();
      const visit=ref=>{const key=keyOf(ref);if(seen.has(key))return;const row=this.get(ref);if(!row)throw Object.assign(new Error('Unknown ruleset '+key+'.'),{code:'UNKNOWN_RULESET',ref:normalizeRef(ref)});for(const parent of row.extends||[])visit(parent);seen.add(key);ordered.push(row);};
      for(const ref of refs||[])visit(ref);return Object.freeze(ordered.slice());
    }
    activeRefs(){return Object.freeze((this.manifest.active||[]).map(normalizeRef));}
    capability(refs,capability){const rows=this.resolve(refs),providers=rows.filter(row=>(row.capabilities||[]).includes(capability));return {ok:providers.length>0,capability,providers:providers.map(row=>normalizeRef(row))};}
    checkDefinition(definition,activeRefs){
      if(!definition||typeof definition!=='object')return {ok:false,code:'INVALID_DEFINITION',reason:'Definition must be an object.'};
      if(!definition.rulesetRef)return {ok:false,code:'MISSING_RULESET_REF',reason:'Definition '+String(definition.id||'')+' has no rulesetRef.'};
      let definitionKey;try{definitionKey=keyOf(definition.rulesetRef);this.resolve([definition.rulesetRef]);}catch(error){return {ok:false,code:error.code||'INVALID_RULESET_REF',reason:error.message};}
      const compatible=new Set(this.resolve(activeRefs).map(row=>keyOf(row)));
      return compatible.has(definitionKey)?{ok:true,definitionKey}:{ok:false,code:'RULESET_MISMATCH',reason:'Definition '+definitionKey+' is not active.'};
    }
  }
  const DEFAULT_ACTIVE_REFS=Object.freeze([
    Object.freeze({schemaVersion:REF_SCHEMA,id:'dnd5e-2014-local',version:'1'}),
    Object.freeze({schemaVersion:REF_SCHEMA,id:'bg3-5e-2014-adaptation',version:'24532579-v10',profile:'standard'})
  ]);
  return Object.freeze({MANIFEST_SCHEMA,REF_SCHEMA,DEFAULT_ACTIVE_REFS,normalizeRef,keyOf,RulesetRegistry});
});

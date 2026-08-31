(function actionKernelModule(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DndWorldActions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function actionKernelFactory(){
  'use strict';
  const EXECUTION_SCHEMA='dnd-world-action-execution/1';
  function actionError(code,message,details){const error=new Error(message||code);error.code=code;error.details=details||null;return error;}
  class ResourceCommitToken{
    constructor(){this.committed=new Set();this.closed=false;}
    commit(key,apply){if(this.closed)throw actionError('COMMIT_PHASE_CLOSED','Resource commit phase is closed.');key=String(key||'').trim();if(!key)throw actionError('INVALID_RESOURCE_KEY','Resource key is required.');if(this.committed.has(key))throw actionError('RESOURCE_DOUBLE_COMMIT','Resource '+key+' was committed twice.');const value=apply();this.committed.add(key);return value;}
    close(){this.closed=true;return [...this.committed];}
  }
  class ActionKernel{
    constructor(){this.inFlight=new Set();}
    async execute(intent,pipeline){
      pipeline=pipeline||{};const key=String(pipeline.key?pipeline.key(intent):intent&&intent.actionId||'').trim();
      if(!key)return this.reject(pipeline,actionError('INVALID_INTENT','Action intent has no key.'),{intent,phase:'intent'});
      if(this.inFlight.has(key)||pipeline.singleFlight!==false&&this.inFlight.size)return this.reject(pipeline,actionError('ACTION_IN_FLIGHT','Another action is already executing.'),{intent,key,phase:'intent'});
      this.inFlight.add(key);let snapshot=null,committed=false,phase='definition';
      try{
        const definition=await pipeline.resolve(intent);phase='context';const context=await pipeline.context(intent,definition);phase='validation';const evaluation=await pipeline.validate(intent,definition,context);
        if(!evaluation||evaluation.allowed!==true)throw actionError(evaluation&&evaluation.reasonCode||'ACTION_REJECTED',evaluation&&evaluation.explanation||'Action is not allowed.',evaluation);
        phase='snapshot';snapshot=await pipeline.snapshot(intent,definition,context,evaluation);phase='prepare';const prepared=await pipeline.prepare(intent,definition,context,evaluation);
        const token=new ResourceCommitToken();phase='commit';const commitResult=await pipeline.commit(prepared,token,{intent,definition,context,evaluation,snapshot});const committedResources=token.close();committed=true;
        phase='consequences';const outcome=await pipeline.consequences(commitResult,{intent,definition,context,evaluation,prepared,committedResources});
        phase='persistence';const persistence=await pipeline.persist(outcome,{intent,definition,context,evaluation,prepared,committedResources,snapshot});
        if(!persistence||persistence.ok!==true)throw actionError(persistence&&persistence.code||'FAILED_TO_PERSIST',persistence&&persistence.reason||'Durable persistence receipt was not produced.',persistence);
        if(persistence.receipt&&outcome&&typeof outcome==='object')outcome.persistenceReceipt=persistence.receipt;
        phase='feedback';return pipeline.present?await pipeline.present(outcome,{persistence,committedResources}):outcome;
      }catch(error){if(snapshot!=null&&typeof pipeline.rollback==='function')try{await pipeline.rollback(snapshot,{intent,key,phase,committed,error});}catch(rollbackError){error.rollbackError=rollbackError;}
        return this.reject(pipeline,error,{intent,key,phase,committed});
      }finally{this.inFlight.delete(key);}
    }
    reject(pipeline,error,meta){if(typeof pipeline.reject==='function')return pipeline.reject(error,meta);return {schemaVersion:EXECUTION_SCHEMA,success:false,outcome:'rejected',reasonCode:error.code||'ACTION_ERROR',message:String(error.message||error),phase:meta.phase};}
  }
  return Object.freeze({EXECUTION_SCHEMA,actionError,ResourceCommitToken,ActionKernel});
});

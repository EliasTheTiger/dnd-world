import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/bg3/bg3-24532579-v10');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value)+'\n');
const definitions={FEATHER_FALL:{IgnoreFallDamage:'ignoreFallDamage'},ALCH_ELIXIR_DARKVISION:{DarkvisionRangeMin:'setDarkvisionMinimum',ActiveCharacterLight:'personalVisionLight'},
 ALCH_OIL_WIZARDSBANE_CONDITION:{SpellSaveDC:'modifySpellSaveDC'},ALCH_OIL_ATTACKBUFF_DIPPED:{WeaponAttackRollBonus:'modifyWeaponAttackRoll'},
 SILENCED:{BlockVerbalComponent:'blockVerbalComponent',DialogueBlock:'blockDialogue',SoundsBlocked:'blockSounds'},BLINDED:{SightRangeMaximum:'setSightMaximum'},
 ALCH_OIL_DAMAGEATTACKBUFF_DIPPED:{WeaponProperty:'setWeaponProperty'}};
const programs=new Map();
for(const file of fs.readdirSync(path.join(base,'rules/statuses'))){
 const filename=path.join(base,'rules/statuses',file),payload=read(filename);let changed=false;
 for(const rule of payload.rules||[]){
  const names=definitions[rule.bg3Id];if(!names)continue;const program=rule.programs.standard;
  for(const field of program.fields){
   field.bytecode=field.bytecode.map(op=>{
    if(op.op!=='manual')return op;
    const name=op.ast?.kind==='call'&&op.ast.name,opcode=names[name];
    if(!opcode)throw new Error('Unreviewed operation in '+rule.bg3Id+': '+JSON.stringify(op));
    return {op:opcode,executable:true,bg3Functor:name,args:op.ast.args,phase:'consequences'};
   });
   if(field.bytecode.some(op=>op.executable!==true))throw new Error('Incomplete field '+rule.bg3Id);
   field.mode=field.bytecode.length?'typed':'empty';field.counts={typedOpcodes:field.bytecode.length,manualOpcodes:0};
  }
  program.mode='typed';program.summary.typedOpcodes=program.fields.reduce((n,f)=>n+f.bytecode.length,0);program.summary.manualOpcodes=0;
  programs.set(program.id,program);changed=true;
 }
 if(changed)save(filename,payload);
}
const refresh=value=>{
 if(!value||typeof value!=='object')return false;
 let changed=false;for(const child of Object.values(value))if(child&&typeof child==='object')changed=refresh(child)||changed;
 if(value.programId&&programs.has(value.programId)){
  const program=programs.get(value.programId);
  if('mode' in value)value.mode='typed';if('programMode' in value)value.programMode='typed';if('projectionMode' in value)value.projectionMode='typed';
  if(value.summary){value.summary.typedOpcodes=program.summary.typedOpcodes;value.summary.manualOpcodes=0;}
  changed=true;
 }
 if(value.schemaVersion==='bg3-action-rule-projection/1'){
  const refs=[...(value.entrypoints||[]),...(value.transitive||[])];
  if(changed&&refs.length&&refs.every(ref=>['typed','empty'].includes(ref.mode))&&!value.unresolved.length&&(value.bg3LifecycleBindings||[]).every(row=>row.complete===true)&&(value.bg3StatusPassiveBindings||[]).every(row=>row.complete===true)){
   value.mode='typed';value.complete=true;value.summary.manualOpcodes=0;value.summary.typedOpcodes=refs.reduce((n,ref)=>n+(ref.summary?.typedOpcodes||0),0);
  }
 }
 if(changed&&value.projection?.complete&&'projectionMode' in value)value.projectionMode=value.projection.mode;
 return changed;
};
let count=0;
for(const file of fs.readdirSync(path.join(base,'items'))){
 const filename=path.join(base,'items',file),payload=read(filename);let changed=false;
 for(const item of payload.items||[]){
  if(!['ALCH_Solution_Potion_FeatherFall','ALCH_Solution_Elixir_Darkvision','ALCH_Solution_Oil_AttackBuff','ALCH_Solution_Oil_Wizardsbane','ALCH_Solution_Oil_DamageAttackBuff','FOR_TrueSoul_Spear','FOR_IncompleteMasterwork_SussurDagger','FOR_IncompleteMasterwork_SussurSickle','FOR_IncompleteMasterwork_SussurGreatsword'].includes(item.source.statsId))continue;
  const uses=item.mechanics.actions||[];
  for(const use of uses){
   if(!refresh(use.program))continue;
   const filename=path.join(base,use.program.rootArtifact),payload=read(filename),program=payload.programs.find(p=>p.id===use.program.id);if(!program)throw new Error(use.program.id);
   refresh(program);save(filename,payload);
  }
  for(const ref of item.mechanics.lifecyclePrograms||[])refresh(ref);
  const coverage=item.mechanics.engineCoverage;
  const actionReady=action=>action.program?.projection? action.program.projection.complete===true : ['typed','empty'].includes(action.program?.mode);
  coverage.counts.readyActions=uses.filter(actionReady).length;coverage.counts.blockedActions=uses.length-coverage.counts.readyActions;
  const grantReady=grant=>grant.resolved===true&&grant.executable===true&&grant.projection?.mode==='typed'&&grant.projection.complete===true&&!grant.projection.unresolved.length&&grant.runtimeReady!==false&&grant.sourceBlocked!==true&&grant.complete!==false;
  const lifecycle=item.mechanics.lifecyclePrograms||[],lifeReady=ref=>['typed','empty'].includes(ref.mode)&&ref.projection?.complete===true&&(ref.grantedActions||[]).every(grantReady)&&(ref.grantedInterrupts||[]).every(row=>row.complete===true&&row.executable===true&&row.projection?.complete===true);
  coverage.counts.readyLifecycle=lifecycle.filter(lifeReady).length;coverage.counts.blockedLifecycle=lifecycle.length-coverage.counts.readyLifecycle;
  if(!coverage.counts.blockedActions&&!coverage.counts.blockedLifecycle&&!coverage.counts.blockedRootPrograms&&!coverage.blockedDescriptors.length){
   coverage.blockerCodes=coverage.blockerCodes.filter(code=>!['source-program-mixed','source-program-manual','incomplete-action-projection','source-lifecycle-mixed','source-lifecycle-manual','incomplete-lifecycle-projection'].includes(code));
   if(!coverage.blockerCodes.length){coverage.runtimeState='ready';coverage.effectStatus='runtime-ready';}
  }
  changed=true;count++;
 }
 if(changed)save(filename,payload);
}
console.log(JSON.stringify({statusPrograms:programs.size,items:count}));

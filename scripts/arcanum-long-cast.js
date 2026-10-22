(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.DND_ARCANUM_LONG_CAST=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SCHEMA='arcanum-long-cast/1',clone=value=>JSON.parse(JSON.stringify(value));
  const fail=reason=>({ok:false,reason});
  function contextCheck(context){
    return !!context&&typeof context.combatId==='string'&&!!context.combatId&&typeof context.casterId==='string'&&!!context.casterId&&
      Number.isInteger(context.round)&&context.round>=1&&typeof context.turnStamp==='string'&&!!context.turnStamp&&context.ownTurn===true;
  }
  function begin(context,payload){
    if(!contextCheck(context))return fail('Начать наложение можно только в собственный ход активного боя.');
    if(!payload||typeof payload.uid!=='string'||!payload.uid||typeof payload.spellId!=='string'||!payload.spellId||
      typeof payload.definitionToken!=='string'||!payload.definitionToken||!Array.isArray(payload.args))return fail('Не удалось сохранить условия наложения.');
    return {ok:true,state:{schemaVersion:SCHEMA,uid:payload.uid,casterId:context.casterId,spellId:payload.spellId,
      combatId:context.combatId,startedRound:context.round,lastRound:context.round,lastTurnStamp:context.turnStamp,
      actionsDone:1,revision:0,status:'casting',definitionToken:payload.definitionToken,paymentToken:payload.paymentToken||null,
      paymentMode:payload.paymentMode,args:clone(payload.args)}};
  }
  function check(state,context){
    if(!state||state.schemaVersion!==SCHEMA||state.status!=='casting'||!Number.isInteger(state.actionsDone)||state.actionsDone<1||state.actionsDone>9||
      state.revision!==state.actionsDone-1||!Number.isInteger(state.startedRound)||state.startedRound<1||
      state.lastRound!==state.startedRound+state.actionsDone-1||!Array.isArray(state.args))return fail('Наложение завершено, прервано или повреждено.');
    if(!contextCheck(context)||context.casterId!==state.casterId||context.combatId!==state.combatId)return fail('Продолжить наложение можно только в собственный ход того же боя.');
    if(context.round===state.lastRound||context.turnStamp===state.lastTurnStamp)return fail('Действие наложения в этом ходу уже учтено.');
    if(context.round!==state.lastRound+1)return fail('Пропущен ход непрерывного наложения; начните заклинание заново.');
    return {ok:true};
  }
  function advance(state,context){
    const ready=check(state,context);if(!ready.ok)return ready;
    if(state.actionsDone===9)return {ok:true,complete:true,expectedRevision:state.revision};
    const next=clone(state);next.actionsDone++;next.revision++;next.lastRound=context.round;next.lastTurnStamp=context.turnStamp;
    return {ok:true,complete:false,state:next};
  }
  function shouldInterrupt(state,context){
    if(!state||state.status!=='casting')return false;
    if(context.combatId!==state.combatId)return true;
    return context.casterId===state.casterId&&(context.round!==state.lastRound||context.turnStamp!==state.lastTurnStamp);
  }
  return Object.freeze({SCHEMA,begin,check,advance,shouldInterrupt});
});

// These adapters are evaluated with the application scripts and invoked only
// after the normal combat, spell, resource and persistence services initialize.
let arcanumLongCastPreparing=null;
function arcanumLongCastEntry(casterId){return getCh(casterId)?.activeFx?.find(entry=>entry.arcanumLongCast?.status==='casting')||null;}
function arcanumLongCastContext(casterId){return {casterId,combatId:combat.id,round:combat.round,turnStamp:arcanumTurnStamp(),ownTurn:combat.active&&combatCurrentKey()==='ally:'+casterId};}
function arcanumLongCastStable(value){return Array.isArray(value)?value.map(arcanumLongCastStable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,arcanumLongCastStable(value[key])])):value;}
function arcanumLongCastDefinition(caster,sp){return gameActionHash(arcanumLongCastStable({spell:sp,cls:caster.cls,level:caster.level,magic:campaignMagic}));}
function arcanumLongCastPayment(caster,sp,slotSel){
  const payment=slotPlanFor(caster,sp,slotSel);if(!payment.ok)return payment;
  // The storage envelope sorts keys. A persisted commitment must therefore use
  // canonical data, while the existing modal's transient token remains untouched.
  const token=payment.mode==='arcanum'?gameActionHash(arcanumLongCastStable({actor:caster.id,cls:caster.cls,level:caster.level,
    entry:(caster.spellbook||[]).find(entry=>entry.spellId===sp.id),state:caster.mysticArcanum,spell:sp,
    rule:classesDB.find(row=>row.n===caster.cls)?.mechanics?.spellcasting})):null;
  return {ok:true,mode:payment.mode,token,openToken:payment.token||null};
}
function arcanumLongCastGuard(caster,entry){
  const state=entry?.arcanumLongCast,sp=state&&spellOf(state.spellId);
  if(!sp||!caster||!entry.conc||!Array.isArray(state.args)||!['conjureFey','createUndead'].includes(arcanumSpecial(sp)))return {ok:false,reason:'Концентрация длительного наложения прервана.'};
  if(arcanumLongCastDefinition(caster,sp)!==state.definitionToken)return {ok:false,reason:'Заклинание или профиль заклинателя изменились; начните наложение заново.'};
  const payment=arcanumLongCastPayment(caster,sp,state.args[5]);
  if(!payment.ok||payment.mode!==state.paymentMode||payment.token!==state.paymentToken)return {ok:false,reason:payment.reason||'Ресурс или выбор арканума изменился; начните наложение заново.'};
  return {ok:true,sp,state};
}
function arcanumLongCastPreflight(sp,caster,input){
  const proof=input?.arcanum?.longCast;
  if(!proof||!combat.active)return {ok:false,reason:'Наложение в бою требует десяти последовательных действий и концентрации.'};
  if(proof.phase==='start'){
    return arcanumLongCastPreparing?.casterId===caster.id&&arcanumLongCastPreparing?.spellId===sp.id?
      {ok:true,phase:'start'}:{ok:false,reason:'Начните длительное наложение через его боевое действие.'};
  }
  const entry=arcanumLongCastEntry(caster.id),guard=arcanumLongCastGuard(caster,entry);
  if(!guard.ok)return guard;
  if(proof.phase!=='complete'||proof.uid!==entry.uid||proof.revision!==guard.state.revision||input.arcanum.completionFactsConfirmed!==true||
    sp.id!==guard.state.spellId||guard.state.actionsDone!==9)return {ok:false,reason:'Не подтверждены десять действий непрерывного наложения и актуальные условия.'};
  if(castCtx?.combatCost!=='action'||castCtx?.combatActorKey!=='ally:'+caster.id||!combatCanSpendPure('action','ally:'+caster.id))
    return {ok:false,reason:'Для завершения минутного наложения нужно десятое действие текущего хода.'};
  const progress=globalThis.DND_ARCANUM_LONG_CAST.check(guard.state,arcanumLongCastContext(caster.id));if(!progress.ok)return progress;
  return {ok:true,phase:'complete',uid:entry.uid};
}
function arcanumLongCastSpend(caster,sp){
  const key='ally:'+caster.id;
  if(!combatSpellTurnAllowed(sp,'action',key,true)||!combatSpend('action','Наложение «'+sp.n+'»',key))throw Error('Действие для продолжения наложения недоступно.');
  combat.turn.spellCasts=combat.turn.spellCasts||[];combat.turn.spellCasts.push({id:sp.id,level:+sp.l||0,cost:'action'});
}
async function arcanumLongCastStart(args){
  const failure=message=>({success:false,message});
  if(!Array.isArray(args))return failure('Не переданы условия длительного наложения.');
  const saved=mechanicsClone(args),caster=getCh(saved[1]),sp=spellOf(saved[0]),stamp=arcanumTurnStamp();
  if(!caster||!sp||!['conjureFey','createUndead'].includes(arcanumSpecial(sp)))return failure('Это заклинание не использует минутное наложение.');
  const current=concLabelOf(caster);
  const openedPayment=castCtx?.kind==='spell'&&castCtx.casterId===caster.id&&castCtx.spellId===sp.id?castCtx.arcanumToken:null;
  if(current&&!window.confirm('Начать минутное наложение «'+sp.n+'» и прервать концентрацию на «'+current+'»? Ячейка или арканум будут потрачены только при завершении.'))return failure('Наложение отменено; действие и ресурс не потрачены.');
  const uid=fxUid(),prepare=()=>{
    if(arcanumTurnStamp()!==stamp||!combat.active||combatCurrentKey()!=='ally:'+caster.id||!combatCanSpendPure('action','ally:'+caster.id)||!combatSpellTurnAllowed(sp,'action','ally:'+caster.id,true))return {ok:false,reason:'Нужно свободное действие своего текущего хода.'};
    if(arcanumLongCastEntry(caster.id))return {ok:false,reason:'Вы уже поддерживаете длительное наложение. Продолжите его или прервите концентрацию.'};
    const payment=arcanumLongCastPayment(caster,sp,saved[5]);if(!payment.ok)return payment;
    if(openedPayment&&openedPayment!==payment.openToken)return {ok:false,reason:'Выбор арканума изменился после открытия окна. Откройте наложение заново.'};
    const input=mechanicsClone(saved[9]||{});input.arcanum=input.arcanum||{};input.arcanum.longCast={phase:'start'};
    let validation;
    try{arcanumLongCastPreparing={casterId:caster.id,spellId:sp.id};validation=spellExecutionPreflight(sp,caster,saved[2],saved[3],saved[4],saved[5],saved[6],saved[7],saved[8],input);}
    finally{arcanumLongCastPreparing=null;}
    if(!validation.ok)return validation;
    return globalThis.DND_ARCANUM_LONG_CAST.begin(arcanumLongCastContext(caster.id),{uid,spellId:sp.id,args:saved,
      definitionToken:arcanumLongCastDefinition(caster,sp),paymentMode:payment.mode,paymentToken:payment.token});
  };
  const result=await arcanumAction('long-cast-start:'+caster.id,prepare,plan=>{
    arcanumLongCastSpend(caster,sp);breakConcentration(caster,'начато минутное наложение');
    caster.activeFx.push({uid,k:'spell',id:sp.id,label:'Наложение «'+sp.n+'»',from:caster.name,casterId:caster.id,
      castId:'long:'+uid,conc:true,fx:[],durationKind:'manual',durationLabel:'10 действий непрерывного наложения',arcanumLongCast:plan.state});
    castLogLine(caster.name+': начато «'+sp.n+'» — 1/10 действий; арканум или ячейка пока не потрачены.');
  });
  if(result.success){closeCastModal();setStatus('Наложение «'+sp.n+'»: 1/10 действий. Поддерживайте концентрацию и продолжайте в каждый свой ход.');}
  return result;
}
async function arcanumLongCastContinue(casterId,executionInput){
  const caster=getCh(casterId),entry=arcanumLongCastEntry(casterId),guard=arcanumLongCastGuard(caster,entry),stamp=arcanumTurnStamp();
  const fail=message=>{setStatus(message,true);return {success:false,message};};
  if(!guard.ok)return fail(guard.reason);
  if(castCtx||rollSpec)return fail('Завершите открытое действие или запрос костей перед продолжением наложения.');
  const prepare=()=>{
    const freshEntry=arcanumLongCastEntry(casterId),fresh=arcanumLongCastGuard(caster,freshEntry);
    if(!fresh.ok)return fresh;
    if(freshEntry.uid!==entry.uid||arcanumTurnStamp()!==stamp||!combatCanSpendPure('action','ally:'+casterId)||!combatSpellTurnAllowed(fresh.sp,'action','ally:'+casterId,true))return {ok:false,reason:'Действие или ход изменились.'};
    const plan=globalThis.DND_ARCANUM_LONG_CAST.advance(fresh.state,arcanumLongCastContext(casterId));return plan.ok?Object.assign(plan,{entry:freshEntry,sp:fresh.sp}):plan;
  };
  const planned=prepare();if(!planned.ok)return fail(planned.reason);
  if(!planned.complete)return arcanumAction('long-cast-continue:'+casterId,prepare,plan=>{
    arcanumLongCastSpend(caster,plan.sp);plan.entry.arcanumLongCast=plan.state;
    castLogLine(caster.name+': «'+plan.sp.n+'» — '+plan.state.actionsDone+'/10 действий; концентрация сохранена.');
  });
  if(castCtx||rollSpec)return fail('Завершите открытое действие перед завершением минутного наложения.');
  const input=mechanicsClone(executionInput||guard.state.args[9]||{});input.arcanum=input.arcanum||{};
  if(!executionInput){
    const question=arcanumSpecial(guard.sp)==='conjureFey'?'Место появления по-прежнему видно, свободно и в пределах 90 футов?':
      'В мире по-прежнему ночь, все выбранные трупы или гули находятся в пределах 10 футов и условия наложения сохранились?';
    if(!window.confirm('Завершить «'+guard.sp.n+'» десятым действием?\n\n'+question))return fail('Завершение отменено; ресурс не потрачен. Наложение ещё можно продолжить в этом ходу.');
    input.arcanum.completionFactsConfirmed=true;
  }
  input.arcanum.longCast={phase:'complete',uid:entry.uid,revision:guard.state.revision};
  const args=mechanicsClone(guard.state.args);args[9]=input;
  const opened={kind:'spell',spellId:guard.sp.id,casterId,target:args[2],combatActorKey:'ally:'+casterId,
    combatCost:'action',combatCommitted:false,combatLabel:'Завершение «'+guard.sp.n+'»'};
  if(guard.state.paymentToken)opened.arcanumToken=arcanumLongCastPayment(caster,guard.sp,args[5]).openToken;
  castCtx=opened;
  try{
    if(guard.state.paymentMode==='arcanum')return await castSpellFinish(...args);
    const result=await arcanumAction('long-cast-complete:'+casterId,
      ()=>spellExecutionPreflight(guard.sp,caster,args[2],args[3],args[4],args[5],args[6],args[7],args[8],args[9]),
      ()=>{if(castSpellApply(...args)!==true)throw Error('Завершение наложения отменено; действие и ресурс восстановлены.');});
    if(result.success)closeCastModal();return result;
  }
  finally{if(castCtx===opened)castCtx=null;}
}
function arcanumLongCastCompleted(casterId,input){
  const proof=input?.arcanum?.longCast;if(proof?.phase!=='complete')return;
  const caster=getCh(casterId),entry=caster?.activeFx?.find(row=>row.uid===proof.uid&&row.arcanumLongCast);
  if(entry)caster.activeFx=caster.activeFx.filter(row=>row!==entry);
}
function arcanumLongCastTurnEnd(key){
  if(!String(key).startsWith('ally:'))return true;
  const caster=getCh(String(key).slice(5)),entry=caster&&arcanumLongCastEntry(caster.id);if(!entry)return true;
  if(globalThis.DND_ARCANUM_LONG_CAST.shouldInterrupt(entry.arcanumLongCast,arcanumLongCastContext(caster.id))){
    removeCastGroup(entry.castId);castLogLine(caster.name+': «'+spellOf(entry.id)?.n+'» прервано — действие наложения в этом ходу пропущено. Арканум или ячейка не потрачены.');
  }
  return true;
}
function arcanumLongCastEndCombat(){
  for(const caster of chars){const entry=arcanumLongCastEntry(caster.id);if(entry){removeCastGroup(entry.castId);castLogLine(caster.name+': незавершённое минутное наложение прервано при окончании боя; ресурс не потрачен.');}}
}
function arcanumLongCastControls(holder){
  const entry=arcanumLongCastEntry(holder.id);if(!entry)return '';
  return '<div class="uses-box"><b>'+esc(entry.label)+'</b> · '+entry.arcanumLongCast.actionsDone+'/10 действий · концентрация'+
    '<button class="btn ghost sm" type="button" onclick="arcanumLongCastContinue('+esc(JSON.stringify(holder.id))+')">Продолжить наложение: действие</button></div>';
}

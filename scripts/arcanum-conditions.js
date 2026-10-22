(function(root){
'use strict';
// SRD 5.1 (2014), Eyebite p.141, Flesh to Stone pp.145–146,
// Mass Suggestion p.163. Attribution/license: data/dnd5e/SRD51-NOTICE.md.
// Pure plans: callers commit payment/action and the returned state together.
// Effects are source-owned projections; never remove another source's condition.
const clone=value=>JSON.parse(JSON.stringify(value));
const spells=['eyebite','fleshToStone','massSuggestion'];
const modes=['asleep','panicked','sickened'];
const id=value=>typeof value==='string'&&value.trim().length>0;
const fail=(reason,requests=[])=>({ok:false,reason,requests});
const active=row=>row.status==='active'||row.status==='permanent';
const immune=(target,condition)=>(target.immuneConditions||[]).includes(condition);
const ids=value=>Array.isArray(value)&&value.every(id)&&new Set(value).size===value.length;
function validTarget(row,spell){
  if(!row||!id(row.targetId)||!['active','ended','permanent'].includes(row.status)||!ids(row.resolvedTurns)||
    !Number.isInteger(row.successes)||row.successes<0||row.successes>3||!Number.isInteger(row.failures)||row.failures<0||row.failures>3||
    typeof row.petrifiedImmune!=='boolean'||!Array.isArray(row.deformities)||row.deformities.some(v=>!id(v)))return false;
  if(row.status==='ended')return true;
  if(row.status==='permanent'&&(spell!=='fleshToStone'||row.mode!=='petrified'))return false;
  return spell==='eyebite'?modes.includes(row.mode):spell==='fleshToStone'?['restrained','petrified'].includes(row.mode):
    row.mode==='suggested'&&['waiting','performing'].includes(row.taskStatus);
}
function validate(state){
  return !!state&&state.version===1&&spells.includes(state.spell)&&id(state.castId)&&id(state.casterId)&&
    Number.isSafeInteger(state.revision)&&state.revision>=0&&Number.isFinite(state.dc)&&state.dc>0&&
    ['active','ended','permanent'].includes(state.status)&&typeof state.concentration==='boolean'&&
    Number.isFinite(state.elapsedSeconds)&&state.elapsedSeconds>=0&&Number.isFinite(state.durationSeconds)&&state.durationSeconds>0&&
    Array.isArray(state.targets)&&state.targets.every(t=>validTarget(t,state.spell))&&
    new Set(state.targets.map(t=>t.targetId)).size===state.targets.length&&ids(state.immuneTargetIds)&&ids(state.processedEvents)&&
    typeof state.order==='string'&&typeof state.trigger==='string'&&
    (state.status==='active'?state.concentration===(state.spell!=='massSuggestion'):!state.concentration);
}
function saveTotal(save){
  if(!save||typeof save!=='object')return null;
  // A supplied total is the already resolved manual save from the shared roller.
  if(Number.isFinite(save.total)&&Number.isInteger(save.total))return save.total;
  if(!Number.isInteger(save.roll)||save.roll<1||save.roll>20||!Number.isInteger(save.bonus))return null;
  const mode=save.mode||'normal';if(!['normal','advantage','disadvantage'].includes(mode))return null;
  if(mode!=='normal'&&(!Number.isInteger(save.secondRoll)||save.secondRoll<1||save.secondRoll>20))return null;
  return (mode==='advantage'?Math.max(save.roll,save.secondRoll):mode==='disadvantage'?Math.min(save.roll,save.secondRoll):save.roll)+save.bonus;
}
function request(state,targetId,phase,turnId){
  return {kind:'savingThrow',castId:state.castId,targetId,ability:state.spell==='fleshToStone'?'con':'wis',dc:state.dc,
    phase,turnId:turnId||null,optional:phase==='endTurn'&&state.spell==='eyebite'};
}
function end(row,reason){row.status='ended';row.endedReason=reason;}
function finishEmpty(state){
  if(state.spell!=='eyebite'&&!state.targets.some(active)){state.status='ended';state.concentration=false;}
}
function successPlan(previous,next,resourceCost=0,actionCost=0){
  next.revision=previous?previous.revision+1:0;
  return {ok:true,castId:next.castId,expectedRevision:previous?previous.revision:null,
    expectedState:previous?JSON.stringify(previous):null,next,resourceCost,actionCost,effects:effects(next)};
}
function targetCheck(state,target,mode){
  if(!target||!id(target.id))return fail('Не выбрана цель.');
  if(target.visible!==true||!Number.isFinite(target.distanceFeet)||target.distanceFeet<0||target.distanceFeet>60)
    return fail('Цель должна быть видна заклинателю и находиться в пределах 60 футов.');
  if(state.spell==='fleshToStone'&&typeof target.flesh!=='boolean')return fail('Укажите, состоит ли тело цели из плоти.');
  if(state.spell==='massSuggestion'&&(target.hears!==true||target.understands!==true))return fail('Каждая цель должна слышать и понимать внушение.');
  if(state.spell==='eyebite'&&!modes.includes(mode))return fail('Выберите сон, панику или дурноту.');
  if(target.immuneConditions!=null&&(!Array.isArray(target.immuneConditions)||target.immuneConditions.some(x=>typeof x!=='string')))
    return fail('Неизвестный список иммунитетов цели.');
  return {ok:true};
}
function initialTarget(state,target,mode){
  const row={targetId:target.id,status:'active',mode:mode||null,resolvedTurns:[],successes:0,failures:0,
    petrifiedImmune:immune(target,'petrified'),deformities:[]};
  if(state.spell==='fleshToStone'&&(!target.flesh||immune(target,'restrained')))end(row,!target.flesh?'notFlesh':'conditionImmune');
  if(state.spell==='massSuggestion'&&immune(target,'charmed'))end(row,'conditionImmune');
  if(state.spell==='eyebite'&&((mode==='asleep'&&(immune(target,'unconscious')||target.immuneSleep===true))||
    (mode==='panicked'&&immune(target,'frightened'))))end(row,'conditionImmune');
  if(!active(row))return {ok:true,row};
  const total=saveTotal(target.save);if(total===null)return fail('Нужен результат спасброска цели.',[request(state,target.id,'initial')]);
  row.initialSaveTotal=total;
  if(total>=state.dc){end(row,'saved');if(state.spell==='eyebite')state.immuneTargetIds.push(target.id);}
  if(state.spell==='fleshToStone')row.mode='restrained';
  if(state.spell==='massSuggestion'){row.mode='suggested';row.taskStatus=state.trigger?'waiting':'performing';}
  return {ok:true,row};
}
function planCast(input){
  if(!input||!spells.includes(input.spell)||!id(input.castId)||!id(input.casterId)||!Number.isInteger(input.dc)||input.dc<1)
    return fail('Не определены заклинание, источник или сложность спасброска.');
  const targets=input.targets;
  if(!Array.isArray(targets)||!targets.length||targets.length>(input.spell==='massSuggestion'?12:1)||
    new Set(targets.map(t=>t?.id)).size!==targets.length)return fail('Выберите допустимое число разных целей.');
  const state={version:1,spell:input.spell,castId:input.castId,casterId:input.casterId,dc:input.dc,revision:0,
    status:'active',concentration:input.spell!=='massSuggestion',elapsedSeconds:0,durationSeconds:input.spell==='massSuggestion'?86400:60,
    targets:[],immuneTargetIds:[],processedEvents:[],order:'',trigger:''};
  if(input.spell==='massSuggestion'){
    if(!id(input.order)||typeof input.reasonable!=='boolean'||typeof input.harmful!=='boolean')
      return fail('Запишите внушение и подтвердите его разумность и отсутствие очевидного вреда.');
    state.order=input.order.trim();state.trigger=typeof input.trigger==='string'?input.trigger.trim():'';
    const level=input.slotLevel==null?6:input.slotLevel;
    if(![6,7,8,9].includes(level))return fail('Недопустимый круг массового внушения.');
    state.durationSeconds={6:86400,7:864000,8:2592000,9:31622400}[level];
  }
  for(const target of targets){const check=targetCheck(state,target,input.mode);if(!check.ok)return check;}
  if(input.spell==='massSuggestion'&&(input.harmful||!input.reasonable)){
    state.status='ended';state.endedReason=input.harmful?'harmfulSuggestion':'unreasonableSuggestion';return successPlan(null,state,1,1);
  }
  const requests=[];
  for(const target of targets){const result=initialTarget(state,target,input.mode);if(!result.ok)requests.push(...result.requests);else state.targets.push(result.row);}
  if(requests.length)return fail('Введите спасброски всех указанных целей.',requests);
  finishEmpty(state);return successPlan(null,state,1,1);
}
function planRetarget(state,input){
  if(!validate(state))return fail('Повреждено сохранённое состояние заклинания.');
  if(state.spell!=='eyebite'||state.status!=='active'||!state.concentration)return fail('Повторное применение взгляда недоступно.');
  if(!input||!id(input.eventId))return fail('Не определено повторное действие.');
  if(state.processedEvents.includes(input.eventId))return fail('Это действие уже учтено.');
  const checked=targetCheck(state,input.target,input.mode);if(!checked.ok)return checked;
  if(state.immuneTargetIds.includes(input.target.id))return fail('Цель уже преуспела в спасброске против этого заклинания.');
  if(state.targets.some(t=>t.targetId===input.target.id&&active(t)))return fail('Эта цель уже находится под действием взгляда.');
  const next=clone(state),result=initialTarget(next,input.target,input.mode);if(!result.ok)return result;
  next.targets=next.targets.filter(t=>t.targetId!==input.target.id);next.targets.push(result.row);next.processedEvents.push(input.eventId);
  return successPlan(state,next,0,1);
}
function pendingSaves(state,targetId,turnId){
  if(!validate(state)||state.status!=='active'||!id(turnId))return [];
  return state.targets.filter(t=>t.targetId===targetId&&t.status==='active'&&!t.resolvedTurns.includes(turnId)&&
    ((state.spell==='fleshToStone'&&t.mode==='restrained')||(state.spell==='eyebite'&&t.mode==='sickened')))
    .map(t=>request(state,t.targetId,'endTurn',turnId));
}
function planEvent(state,event){
  if(!validate(state))return fail('Повреждено сохранённое состояние заклинания.');
  if(!event||!id(event.eventId))return fail('Не определено событие заклинания.');
  if(state.processedEvents.includes(event.eventId))return fail('Это событие уже учтено.');
  if(state.status==='ended')return fail('Заклинание уже завершилось.');
  const next=clone(state),row=next.targets.find(t=>t.targetId===event.targetId&&active(t));
  let actionCost=0;
  switch(event.type){
    case 'endTurn':{
      if(!id(event.turnId))return fail('Не определён завершающийся ход.');
      const requests=pendingSaves(state,event.targetId,event.turnId);
      if(!requests.length)return fail('Для этой цели в этом ходу повторный спасбросок не требуется.');
      const total=saveTotal(event.save);
      if(total===null&&!(event.decline===true&&requests[0].optional))return fail('Введите результат повторного спасброска.',requests);
      row.resolvedTurns.push(event.turnId);
      if(total===null)break;
      row.lastSaveTotal=total;
      if(next.spell==='eyebite'){
        if(total>=next.dc){end(row,'saved');if(!next.immuneTargetIds.includes(row.targetId))next.immuneTargetIds.push(row.targetId);}
      }else{
        row[total>=next.dc?'successes':'failures']++;
        if(row.successes===3)end(row,'threeSaves');
        else if(row.failures===3){if(row.petrifiedImmune)end(row,'conditionImmune');else row.mode='petrified';}
      }
      break;
    }
    case 'damage':
      if(!row||!Number.isFinite(event.amount)||event.amount<=0)return fail('Не указаны цель и фактически полученный урон.');
      if(next.spell==='eyebite'&&row.mode==='asleep')end(row,'damage');
      if(next.spell==='massSuggestion'){
        if(event.sourceId!==state.casterId&&typeof event.sourceIsCompanion!=='boolean')return fail('Укажите, является ли источник урона спутником заклинателя.');
        if(event.sourceId===state.casterId||event.sourceIsCompanion===true)end(row,'casterOrCompanionDamage');
      }
      break;
    case 'wake':
      if(next.spell!=='eyebite'||row?.mode!=='asleep'||!id(event.actorId)||event.actorId===row.targetId)
        return fail('Разбудить спящего действием может другое существо.');
      end(row,'woken');actionCost=1;break;
    case 'position':
      if(next.spell!=='eyebite'||row?.mode!=='panicked'||!Number.isFinite(event.distanceFeet)||event.distanceFeet<0||typeof event.canSeeCaster!=='boolean')
        return fail('Укажите расстояние и видимость источника паники.');
      if(event.distanceFeet>=60&&!event.canSeeCaster)end(row,'escaped');break;
    case 'taskTriggered':
      if(next.spell!=='massSuggestion'||!row||row.taskStatus!=='waiting')return fail('Нет ожидающего условия внушения.');
      row.taskStatus='performing';break;
    case 'taskComplete':
      if(next.spell!=='massSuggestion'||!row||row.taskStatus!=='performing')return fail('Нет выполняемого внушения.');
      end(row,'taskComplete');break;
    case 'physicalBreak':
      if(next.spell!=='fleshToStone'||row?.mode!=='petrified'||!id(event.description))return fail('Опишите повреждение окаменевшего тела.');
      row.deformities.push(event.description.trim());break;
    case 'concentrationBroken':
      if(!next.concentration)return fail('Это заклинание не требует концентрации.');
      for(const target of next.targets)if(target.status==='active')end(target,'concentrationBroken');
      next.status='ended';next.concentration=false;break;
    case 'elapsed':
      if(state.status!=='active'||!Number.isFinite(event.seconds)||event.seconds<=0)return fail('Укажите положительное прошедшее время.');
      next.elapsedSeconds=Math.min(next.durationSeconds,next.elapsedSeconds+event.seconds);
      if(next.elapsedSeconds>=next.durationSeconds){
        for(const target of next.targets)if(target.status==='active'){
          if(next.spell==='fleshToStone'&&next.concentration&&!target.petrifiedImmune){target.mode='petrified';target.status='permanent';}
          else end(target,'expired');
        }
        next.concentration=false;next.status=next.targets.some(t=>t.status==='permanent')?'permanent':'ended';
      }
      break;
    case 'remove':
      if(!row)return fail('Для цели нет эффекта этого заклинания.');
      end(row,'removed');break;
    default:return fail('Неизвестное событие заклинания.');
  }
  next.processedEvents.push(event.eventId);finishEmpty(next);return successPlan(state,next,0,actionCost);
}
function effects(state){
  if(!state||!Array.isArray(state.targets))return [];
  return state.targets.filter(active).map(row=>{
    const result={castId:state.castId,casterId:state.casterId,targetId:row.targetId,spell:state.spell,mode:row.mode,
      concentration:state.concentration&&row.status!=='permanent',permanent:row.status==='permanent',
      remainingSeconds:row.status==='permanent'?null:Math.max(0,state.durationSeconds-state.elapsedSeconds),conditions:[],
      disadvantage:{attack:false,ability:false},deformities:clone(row.deformities)};
    if(row.mode==='asleep')result.conditions=['unconscious'];
    if(row.mode==='panicked'){result.conditions=['frightened'];result.mustDashAway=true;result.fearSourceId=state.casterId;result.movementRule='safestShortestRouteUnlessBlocked';}
    if(row.mode==='sickened'){result.disadvantage={attack:true,ability:true};result.repeatSave={ability:'wis',dc:state.dc,at:'endTurn',optional:true};}
    if(row.mode==='restrained'){result.conditions=['restrained'];result.repeatSave={ability:'con',dc:state.dc,at:'endTurn',successes:row.successes,failures:row.failures,required:3};}
    if(row.mode==='petrified')result.conditions=['petrified'];
    if(row.mode==='suggested'){result.order=state.order;result.trigger=state.trigger;result.taskStatus=row.taskStatus;}
    return result;
  });
}
function applyPlan(current,plan){
  if(!plan?.ok||!validate(plan.next))return fail('Нет проверенного плана заклинания.');
  if(plan.expectedRevision===null){if(current!=null)return fail('Это заклинание уже применено.');}
  else if(!validate(current)||current.castId!==plan.castId||current.revision!==plan.expectedRevision||JSON.stringify(current)!==plan.expectedState)
    return fail('Состояние заклинания изменилось; повторите действие.');
  return {ok:true,state:clone(plan.next),effects:effects(plan.next)};
}
root.DND_ARCANUM_CONDITIONS=Object.freeze({planCast,planRetarget,planEvent,applyPlan,pendingSaves,effects,validate,saveTotal});
})(typeof window!=='undefined'?window:globalThis);

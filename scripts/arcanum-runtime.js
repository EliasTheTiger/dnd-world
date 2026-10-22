'use strict';
let arcanumCombatTransitionDepth=0;

function arcanumSpecial(sp){return ({sp_истинное_зрение:'trueSeeing',sp_open5e_srd_2014_srd_circle_of_death:'circleOfDeath',sp_open5e_srd_2014_srd_conjure_fey:'conjureFey',sp_open5e_srd_2014_srd_create_undead:'createUndead',sp_open5e_srd_2014_srd_eyebite:'eyebite',sp_open5e_srd_2014_srd_flesh_to_stone:'fleshToStone',sp_open5e_srd_2014_srd_mass_suggestion:'massSuggestion'})[sp?.id]||'';}
function arcanumReconcileSpell(sp){
 const special=arcanumSpecial(sp),revision='arcanum-sixth-2014-1';
 if(!special||sp.custom||sp.mechanics?.origin==='editor'||sp.grimoire?.translation==='custom'||sp.grimoire?.edition!=='2014'||sp.grimoire?.arcanumRevision===revision)return;
 let m=mechanicsClone(sp.mechanics);if(!m)return;
 if(['trueSeeing','circleOfDeath'].includes(special))m=globalThis.DND_ARCANUM_CORE.buildMechanics(special,m);
 else {
  const summon=['conjureFey','createUndead'].includes(special),mass=special==='massSuggestion';
  Object.assign(m,{mode:'structured',origin:'explicit',special,manualNote:'',effects:[],breakOn:[],activation:{cost:summon?'long':'action',ritual:false},target:{kind:summon?'none':'any',base:mass?12:1},
   duration:special==='createUndead'?{kind:'instant',rounds:0,label:'Мгновенная',concentration:false}:{kind:'rounds',rounds:mass?14400:special==='conjureFey'?600:10,label:mass?'24 часа':special==='conjureFey'?'1 час':'1 минута',concentration:!mass},
   resolution:normalizeResolutionContract({attack:null,save:summon?null:{key:special==='fleshToStone'?'con':'wis',dc:{source:'spell'},half:false,tags:['magical']},contest:null,rolls:[],needsRoll:!summon},'spell')});
  m.spell=compileSpellRule(sp,m);m.spell.input.requireCompleteRolls=!summon;
  m.spell.targeting.type=summon?'none':'any';m.spell.targeting.count={base:mass?12:1,perSlot:0,fromSlot:6,allCreatures:false};
  // These scene facts are collected explicitly with names by the adapter.
  m.spell.range.requiresMeasurement=false;m.spell.range.requiresLineOfSight=false;m.spell.input.requireSceneFacts=false;
 }
 m.sourceHash=mechanicsSourceHash(sp,'spell');m.resolution=normalizeResolutionContract(m.resolution,'spell');
 if(['trueSeeing','circleOfDeath'].includes(special))m.spell=globalThis.DND_ARCANUM_CORE.projectRule(special,compileSpellRule(sp,m),m);
 sp.mechanics=m;sp.grimoire.arcanumRevision=revision;
}
function arcanumPromptNumber(label){const raw=window.prompt(label,'');if(raw==null)throw Error('cancelled');if(String(raw).trim()==='')throw Error('Введите число.');const n=Number(String(raw).replace(',','.'));if(!Number.isFinite(n)||n<0)throw Error('Введите неотрицательное число.');return n;}
function arcanumPromptBool(label){const raw=window.prompt(label+' (да/нет)','');if(raw==null)throw Error('cancelled');if(!/^(да|нет)$/i.test(raw.trim()))throw Error('Ответьте «да» или «нет».');return /^да$/i.test(raw.trim());}
function arcanumPromptText(label){const raw=window.prompt(label,'');if(raw==null)throw Error('cancelled');if(!raw.trim())throw Error('Введите ответ.');return raw.trim();}
function arcanumChoose(label,rows){if(!rows.length)throw Error('Нет подходящих вариантов: '+label);const n=arcanumPromptNumber(label+'\n'+rows.map((r,i)=>(i+1)+'. '+r.label).join('\n'));if(!Number.isInteger(n)||!rows[n-1])throw Error('Выберите номер из списка.');return rows[n-1].value;}
function arcanumCollectInput(sp,targets,input){
 const special=arcanumSpecial(sp);if(!special||sp.mechanics?.special!==special)return {ok:true,input};
 const caster=getCh(castCtx?.casterId);if(!caster)return {ok:false,reason:'Заклинатель не найден.'};
 try{
  const a=input.arcanum={byTarget:{}};
  if(special==='circleOfDeath'){
   a.centerDistanceM=arcanumPromptNumber('«Круг смерти»: расстояние до центра сферы, м');a.clearPath=arcanumPromptBool('До центра сферы свободен путь');
   a.allCreaturesIncluded=arcanumPromptBool('Вы выбрали ВСЕ существа без полного укрытия в радиусе 60 футов (18,288 м), включая союзников');
   for(const key of targets)a.byTarget[key]={distanceFromCenterM:arcanumPromptNumber(targetInfoOf(key).name+': расстояние до центра сферы, м'),totalCover:arcanumPromptBool(targetInfoOf(key).name+': полное укрытие от центра сферы')};
  }else if(special==='trueSeeing'){
   a.willing=arcanumPromptBool(targetInfoOf(targets[0]).name+' согласен принять «Истинное зрение»');a.distanceM=arcanumPromptNumber('Расстояние для касания цели, м');
  }else if(['conjureFey','createUndead'].includes(special))return arcanumCollectSummon(sp,caster,input);
  else {
   if(special==='eyebite')a.mode=arcanumChoose('Эффект «Дурного глаза»',[{label:'Сон',value:'asleep'},{label:'Паника',value:'panicked'},{label:'Дурнота',value:'sickened'}]);
   if(special==='massSuggestion'){a.order=arcanumPromptText('Внушение: одно-два предложения');const trigger=window.prompt('Условие начала выполнения (оставьте пустым для немедленного выполнения)','');if(trigger==null)throw Error('cancelled');a.trigger=trigger.trim();a.reasonable=arcanumPromptBool('Предложение сформулировано разумно для целей');a.harmful=arcanumPromptBool('Предложение требует явно вредящего цели поступка');}
   for(const key of targets){const ti=targetInfoOf(key);if(!ti.obj)throw Error('Выберите конкретное существо.');const f=a.byTarget[key]={visible:arcanumPromptBool('Заклинатель видит '+ti.name),distanceM:arcanumPromptNumber('Расстояние до '+ti.name+', м')};
    if(special==='fleshToStone')f.flesh=arcanumPromptBool(ti.name+' состоит из плоти');
    if(special==='massSuggestion'){f.hears=arcanumPromptBool(ti.name+' слышит внушение');f.understands=arcanumPromptBool(ti.name+' понимает язык внушения');}
   }
  }
  return {ok:true,input};
 }catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Наложение отменено; ресурсы не потрачены.':error.message};}
}
function arcanumPreflight(sp,caster,targets,level,rolls,byTarget,input){
 const special=arcanumSpecial(sp);if(!special||sp.mechanics?.special!==special)return {ok:true};
 const a=input?.arcanum,core=globalThis.DND_ARCANUM_CORE;
 if(special==='trueSeeing')return core.validateTrueSeeingInput(a);
 if(special==='circleOfDeath'){
  const area=core.validateCircleArea(a,targets);if(!area.ok)return area;
  return core.validateCircleDamage(targets.map((key,i)=>i?byTarget?.[key]:rolls),level,(amount,i)=>dmgAfterTraits(targetInfoOf(targets[i]).obj,amount,'некротическая энергия',{magical:true}).amount);
 }
 if(['conjureFey','createUndead'].includes(special))return arcanumSummonPreflight(sp,caster,level,input);
 return arcanumConditionPreflight(sp,caster,targets,level,rolls,byTarget,input);
}
function arcanumConditionTarget(key,facts,rolls){
 const ti=targetInfoOf(key),names={unconscious:'Бессознательный',frightened:'Испуганный',restrained:'Опутанный',petrified:'Окаменевший',charmed:'Очарованный'};
 if(!ti.obj)return null;
 const conditions=ti.kind==='ally'?effectiveConditions(ti.obj):effectiveFoeConditions(ti.obj);
 return {id:key,...facts,...(conditions.includes('Глухой')?{hears:false}:{}),distanceFeet:typeof facts?.distanceM==='number'?facts.distanceM/0.3048:null,
  immuneConditions:Object.keys(names).filter(name=>holderConditionImmune(ti.obj,names[name])),immuneSleep:holderEffectImmune(ti.obj,'magicalSleep'),
  save:rolls?.saveMade&&typeof rolls.saveOk==='boolean'?{total:rolls.saveAutoFail?-1:rolls.saveTotal}:null};
}
function arcanumConditionPreflight(sp,caster,targets,level,rolls,byTarget,input){
 if(effectiveConditions(caster).includes('Ослепленный'))return {ok:false,reason:'Заклинатель ослеплён и не видит цель.'};
 const a=input?.arcanum||{},castId='pending:'+caster.id+':'+sp.id;
 const plan=globalThis.DND_ARCANUM_CONDITIONS.planCast({spell:arcanumSpecial(sp),castId,casterId:caster.id,dc:spellDC(caster),slotLevel:level,
  mode:a.mode,order:a.order,trigger:a.trigger,reasonable:a.reasonable,harmful:a.harmful,
  targets:targets.map((key,i)=>arcanumConditionTarget(key,a.byTarget?.[key],i?byTarget?.[key]:rolls))});
 return plan.ok?{ok:true,handled:true,kind:'condition',plan}:plan;
}
function arcanumCastMarkers(){return chars.flatMap(holder=>(holder.activeFx||[]).filter(entry=>entry.arcanumCast).map(entry=>({holder,entry,state:entry.arcanumCast})));}
function arcanumFindCast(castId){return arcanumCastMarkers().find(x=>x.entry.castId===castId);}
function arcanumProjectCondition(marker){
 const state=marker.arcanumCast,rows=globalThis.DND_ARCANUM_CONDITIONS.effects(state),names={unconscious:'Бессознательный',frightened:'Испуганный',restrained:'Опутанный',petrified:'Окаменевший'};
 marker.conc=state.concentration;marker.why=state.order||'Управление действующим заклинанием';
 for(const holder of chars.concat(foesDB)){
  const key=(foesDB.includes(holder)?'foe:':'ally:')+holder.id,row=rows.find(r=>r.targetId===key),prior=(holder.activeFx||[]).find(e=>e.arcanumConditionCast===state.castId);
  if(!row){if(prior){detachActiveFx(holder,prior);holder.activeFx=holder.activeFx.filter(e=>e!==prior);}continue;}
  const fx=row.conditions.map(name=>({stat:'condition',mode:'text',value:names[name]}));
  if(row.disadvantage.attack)fx.push({stat:'attack',mode:'dis',value:1});if(row.disadvantage.ability)fx.push({stat:'check',mode:'dis',value:1});
  if(row.order)fx.push({stat:'note',mode:'text',value:'Внушение: '+row.order});
  if(row.mustDashAway)fx.push({stat:'note',mode:'text',value:'Паника: используйте Рывок и удаляйтесь от заклинателя самым коротким безопасным путём, если путь есть.'});
  const entry={...(prior||{}),k:'spell',id:marker.id,label:marker.label,from:marker.from,casterId:state.casterId,castId:state.castId,stackKey:'spell:'+marker.id,power:marker.power||6,
   arcanumConditionCast:state.castId,arcanumMode:row.mode,conc:row.concentration,fx,mechanicsVersion:GAME_MECHANICS_SCHEMA_VERSION,durationKind:'manual',durationLabel:row.permanent?'до снятия окаменения':Math.ceil(row.remainingSeconds/6)+' раунд.',appliedRound:prior?.appliedRound??fxRound};
  delete entry.expiresAtRound;delete entry.repeatSave;delete entry.arcanumRepeat;
  if(row.repeatSave){entry.repeatSave={when:'end',key:row.repeatSave.ability,dc:row.repeatSave.dc,magic:true};entry.arcanumRepeat=true;entry.why=row.repeatSave.required?'Успехи: '+row.repeatSave.successes+'/3; провалы: '+row.repeatSave.failures+'/3':'Повторный спасбросок в конце хода';}
  if(prior){delete prior.repeatSave;delete prior.arcanumRepeat;delete prior.expiresAtRound;Object.assign(prior,entry);if(fx.some(f=>f.stat==='condition'&&ACTION_BLOCK_CONDS.includes(f.value)))breakConcentration(holder,'наложено состояние');}
  else if(foesDB.includes(holder))applyFxToFoe(holder,entry);else applyFxTo(holder.id,entry);
 }
 if(state.status==='ended'){const owner=getCh(state.casterId);if(owner)owner.activeFx=owner.activeFx.filter(e=>e!==marker);}
 fxInvalidate();
}
function arcanumConditionEvent(castId,event){
 const row=arcanumFindCast(castId);if(!row)return {ok:false,reason:'Эффект уже завершён.'};
 const api=globalThis.DND_ARCANUM_CONDITIONS,plan=api.planEvent(row.state,{eventId:fxUid(),...event});if(!plan.ok)return plan;
 const applied=api.applyPlan(row.state,plan);if(!applied.ok)return applied;
 row.entry.arcanumCast=applied.state;arcanumProjectCondition(row.entry);return {ok:true,plan};
}
function arcanumConditionRepeatApply(entry,key,success,total,stamp,decline=false){
 const result=arcanumConditionEvent(entry.arcanumConditionCast,{type:'endTurn',targetId:key,turnId:stamp,...(decline?{decline:true}:{save:{total:total==null?-1:total}})});if(!result.ok)throw Error(result.reason);
}
function arcanumCommitCast(enginePlan,sp,caster,castId){
 const result=enginePlan.arcanum;
 if(result.kind==='condition'){
  const state=mechanicsClone(result.plan.next);state.castId=castId;
  if(state.status!=='ended'){
   const marker={uid:fxUid(),k:'spell',id:sp.id,label:sp.n,from:caster.name,casterId:caster.id,castId,conc:state.concentration,fx:[],power:enginePlan.usedSlotLvl,
    arcanumCast:state,arcanumClock:fxRound,durationKind:'manual',durationLabel:sp.d,mechanicsVersion:GAME_MECHANICS_SCHEMA_VERSION};
   caster.activeFx=caster.activeFx||[];caster.activeFx.push(marker);arcanumProjectCondition(marker);
  }
 }else arcanumCommitSummons(result,caster,sp,castId);
 lastCastEvent={castId,casterId:caster.id,spellId:sp.id,usedSlotLvl:enginePlan.usedSlotLvl,round:fxRound,targets:enginePlan.targets.slice(),outcomeNotes:[]};
 recipeTabletopSpellTrigger(caster,sp);castLogLine(caster.name+': «'+sp.n+'» применено.');setStatus('«'+sp.n+'» применено. Последствия и срок действия учитываются в карточках.');fxInvalidate();scheduleSave();renderChars();renderFoes();renderCombat();
}
function arcanumDamage(holder,amount,context){
 const key=(foesDB.includes(holder)?'foe:':'ally:')+holder.id;
 for(const row of arcanumCastMarkers().slice()){
  if(!row.state.targets.some(t=>t.targetId===key&&t.status==='active'))continue;
  const source=context.sourceActorKey||'',casterKey='ally:'+row.state.casterId;
  let companion=source.startsWith('ally:')||source.startsWith('foe:')&&foeOf(source.slice(4))?.summonSide==='ally';
  if(row.state.spell==='massSuggestion'&&!source){
   // A direct HP edit has no actor. Ask the missing scene fact; never invent a source.
   companion=window.confirm('Урон '+(holder.name||holder.n)+' нанесён заклинателем «Массового внушения» или его спутником? ОК — да, Отмена — нет.');
  }
  if(row.state.spell==='massSuggestion'||row.state.spell==='eyebite'){
   const result=arcanumConditionEvent(row.state.castId,{type:'damage',targetId:key,amount,sourceId:source===casterKey?row.state.casterId:source,sourceIsCompanion:!!companion});if(!result.ok)throw Error(result.reason);
  }
 }
}
function arcanumAdvanceTime(){
 for(const row of arcanumCastMarkers().slice()){
  const elapsed=fxRound-(row.entry.arcanumClock??fxRound);if(elapsed<=0||row.state.status!=='active')continue;
  row.entry.arcanumClock=fxRound;const result=arcanumConditionEvent(row.state.castId,{type:'elapsed',seconds:elapsed*6});if(!result.ok)throw Error(result.reason);
 }
 arcanumSummonTick();
}
function arcanumInventoryText(caster,entry){const it=itemOf(entry.itemId);return String([it?.n,it?.x,it?.desc,entry.notes].filter(Boolean).join(' ')).toLowerCase().replace(/ё/g,'е');}
function arcanumUndeadMaterials(caster,input,count){
 const inv=caster.inventory||[],get=id=>inv.find(e=>e.id===id&&(+e.qty||0)>0),dirt=get(input?.dirtEntryId),water=get(input?.waterEntryId),stones=[];
 if(!dirt||!water||dirt===water||!/(кладбищ|могильн)/.test(arcanumInventoryText(caster,dirt))||!/земл/.test(arcanumInventoryText(caster,dirt))||!/горш/.test(arcanumInventoryText(caster,dirt))||!/горш/.test(arcanumInventoryText(caster,water))||!/солоноват|солен/.test(arcanumInventoryText(caster,water))||!/вод/.test(arcanumInventoryText(caster,water)))return {ok:false,reason:'Выберите в инвентаре разные горшки: с кладбищенской землёй и солоноватой водой.'};
 const selected=input.onyxEntryIds;if(!Array.isArray(selected)||selected.length!==count)return {ok:false,reason:'Нужен отдельный оникс для каждой цели.'};
 const used={};for(const id of selected){const entry=get(id),it=entry&&itemOf(entry.itemId),value=entry&&itemEntryGoldValue(entry,it);used[id]=(used[id]||0)+1;
  if(!entry||!/(?:черн.*оникс|оникс.*черн)/.test(arcanumInventoryText(caster,entry))||!(value>=150)||used[id]>entry.qty)return {ok:false,reason:'Каждой цели нужен чёрный оникс не дешевле 150 зм; число камней проверяется по инвентарю.'};
  stones.push({id:id+':'+used[id],valueGp:value});
 }
 return {ok:true,materials:{graveDirtPot:true,brackishWaterPot:true,onyxStones:stones}};
}
function arcanumCollectSummon(sp,caster,input){
 try{
  const a=input.arcanum,special=arcanumSpecial(sp),api=globalThis.DND_ARCANUM_SUMMONS;
  if(!combat.active)a.castingMinuteCompleted=arcanumPromptBool('Минута непрерывного наложения завершена без потери концентрации');
  if(special==='conjureFey'){
   a.templateId=arcanumChoose('Мастер выбирает появляющееся существо',api.feyCandidates(seedFoesDB(),6).map(f=>({value:f.id,label:f.n+' · опасность '+f.cr})));
   a.positionConfirmed=arcanumPromptBool('Выбрано видимое свободное место в пределах 90 футов (27,432 м)');a.initiativeDie=arcanumPromptNumber('Бросьте d20 инициативы призванного существа и введите выпавшее число');
  }else{
   a.night=arcanumPromptBool('В игровом мире сейчас ночь');a.mode=arcanumChoose('Создание нежити',[{label:'Создать гулей из трупов',value:'create'},{label:'Продлить контроль над своими гулями',value:'renew'}]);
   const candidates=foesDB.filter(f=>a.mode==='create'?f.hp<=0&&api.creatureKind(f)==='humanoid'&&!f.animatedByCastId:f.arcanumSummon?.kind==='createUndead'&&f.arcanumSummon.casterId===caster.id&&f.arcanumSummon.controlled);
   const count=arcanumPromptNumber('Число целей: от 1 до 3');if(!Number.isInteger(count)||count<1||count>3)throw Error('Выберите от 1 до 3 целей.');
   a.targetIds=[];a.withinRange={};a.initiativeDice={};
   for(let i=0;i<count;i++){const id=arcanumChoose('Цель '+(i+1),candidates.filter(f=>!a.targetIds.includes(f.id)).map(f=>({value:f.id,label:f.n})));a.targetIds.push(id);a.withinRange[id]=arcanumPromptBool(foeOf(id).n+' находится в пределах 10 футов (3,048 м)');if(a.mode==='create')a.initiativeDice[id]=arcanumPromptNumber('Бросьте d20 инициативы гуля '+(i+1));}
   const entries=(caster.inventory||[]).map(e=>({value:e.id,label:(itemOf(e.itemId)?.n||e.itemId)+' ×'+e.qty}));
   a.dirtEntryId=arcanumChoose('Горшок с кладбищенской землёй',entries);a.waterEntryId=arcanumChoose('Горшок с солоноватой водой',entries);a.onyxEntryIds=[];
   for(let i=0;i<count;i++)a.onyxEntryIds.push(arcanumChoose('Чёрный оникс для цели '+(i+1)+' (не менее 150 зм)',entries));
  }
  return {ok:true,input};
 }catch(error){return {ok:false,reason:error.message==='cancelled'?'Наложение отменено; ресурсы не потрачены.':error.message};}
}
function arcanumSummonPreflight(sp,caster,level,input,castId='pending:'+caster.id+':'+sp.id){
 const a=mechanicsClone(input?.arcanum||{}),special=arcanumSpecial(sp),api=globalThis.DND_ARCANUM_SUMMONS;
 const longCast=combat.active?arcanumLongCastPreflight(sp,caster,input):null;if(longCast&&!longCast.ok)return longCast;
 if(!combat.active&&a.castingMinuteCompleted!==true)return {ok:false,reason:'Подтвердите минуту непрерывного наложения.'};
 const time=recipeTabletopTimeCheck(combat.active?0:10);if(!time.ok)return time;
 const context={casterId:caster.id,castId,round:fxRound+(combat.active?0:10),slotLevel:level};let plan;
 if(special==='conjureFey')plan=api.planConjureFey(context,a,seedFoesDB());
 else {
  const material=arcanumUndeadMaterials(caster,a,a.targetIds?.length||0);if(!material.ok)return material;a.materials=material.materials;
  if(a.mode==='create')a.corpses=(a.targetIds||[]).map(id=>{const f=foeOf(id);return f?{id:f.id,hp:f.hp,creatureType:f.creatureType,size:f.size,isCorpse:f.hp<=0,withinRange:a.withinRange?.[id]===true,animatedByCastId:f.animatedByCastId}:null;});
  plan=api.planCreateUndead(context,a,seedFoesDB(),foesDB);
 }
 if(!plan.ok)return plan;
 return {ok:true,handled:true,kind:'summon',plan,input:mechanicsClone(input),level,longCast};
}
function arcanumCommitSummons(result,caster,sp,castId){
 let plan;
 if(result.longCast?.phase==='complete'){
  plan=mechanicsClone(result.plan);
  // Only identities depend on the final cast ID; all scene/resource facts were
  // checked immediately before this synchronous consequence commit.
  const oldId='pending:'+caster.id+':'+sp.id;
  const replace=value=>typeof value==='string'?value.replaceAll(encodeURIComponent(oldId),encodeURIComponent(castId)).replaceAll(oldId,castId):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
  plan=replace(plan);
 }else {const fresh=arcanumSummonPreflight(sp,caster,result.level,result.input,castId);if(!fresh.ok)throw Error(fresh.reason);if(advanceFxRound(10)===false)throw Error('Не удалось учесть минуту наложения.');plan=fresh.plan;}
 for(const actor of plan.actors||[]){if(foeOf(actor.id))throw Error('Этот призыв уже применён.');upgradeFoe(actor);if(actor.arcanumSummon?.kind==='conjureFey')actor.activeFx.push({uid:fxUid(),k:'spell',id:sp.id,label:sp.n,casterId:caster.id,castId,conc:true,fx:[],power:result.level,arcanumFeyTarget:true,expiresAtRound:fxRound+600,durationKind:'rounds',durationLabel:'1 час',appliedRound:fxRound});foesDB.push(actor);}
 for(const actor of plan.updates||[]){const current=foeOf(actor.id);if(!current)throw Error('Цель контроля исчезла.');Object.assign(current,actor);}
 for(const corpse of plan.corpseUpdates||[]){const current=foeOf(corpse.id);if(!current||current.animatedByCastId)throw Error('Труп уже использован.');current.animatedByCastId=castId;}
 if(combat.active){const currentKey=combatCurrentKey();for(const initiative of plan.initiatives||[]){const e={kind:'foe',id:initiative.id,nat:initiative.die,mod:initiative.modifier,initiative:initiative.total,seq:combat.order.length,reactionUsed:false};combat.order.push(e);combat.snapshots['foe:'+e.id]=combatSnapshotOf(e);}combat.order.sort((a,b)=>(b.initiative-a.initiative)||(a.seq-b.seq));combat.turnIndex=combat.order.findIndex(e=>combatEntryKey(e)===currentKey);}
 if(plan.concentration)caster.activeFx.push({uid:fxUid(),k:'spell',id:sp.id,label:sp.n,casterId:caster.id,castId,conc:true,fx:[],arcanumFey:true,expiresAtRound:fxRound+600,durationKind:'rounds',durationLabel:'1 час',appliedRound:fxRound});
}
function arcanumRepairSummonOrder(){
 if(!combat.active)return;
 // The turn owns its spent actions even when an earlier initiative entry vanishes.
 const key=combat.turn?.actorKey||combatCurrentKey();
 if(!combatActorByKey(key)&&combat.order.some(e=>combatEntryKey(e)===key)&&!arcanumCombatTransitionDepth){
  if(combat.order.some(e=>combatActorHasTurn(combatEntryKey(e)))){combatAdvanceTurn();return;}
  combat.active=false;combat.turn=null;
 }
 combat.order=combat.order.filter(e=>combatActorByKey(combatEntryKey(e)));
 combat.turnIndex=Math.max(0,combat.order.findIndex(e=>combatEntryKey(e)===key));
 if(!combat.order.some(e=>combatEntryKey(e)===combat.focusKey))combat.focusKey=combatCurrentKey();
}
function arcanumSummonTick(){
 for(const actor of foesDB.slice()){
  if(!actor.arcanumSummon)continue;const plan=globalThis.DND_ARCANUM_SUMMONS.lifecycle(actor,{round:fxRound});if(!plan.ok)throw Error(plan.reason);
  if(plan.operation==='remove')foesDB=foesDB.filter(f=>f!==actor);else if(plan.operation==='update')Object.assign(actor,plan.actor);
 }
 arcanumRepairSummonOrder();
}
function arcanumConcentrationBreak(castId){
 for(const actor of foesDB.filter(f=>f.summonedByCastId===castId&&f.arcanumSummon?.kind==='conjureFey')){
  const plan=globalThis.DND_ARCANUM_SUMMONS.lifecycle(actor,{round:fxRound,concentrationLost:true});if(!plan.ok)throw Error(plan.reason);
  if(plan.operation==='update'){Object.assign(actor,plan.actor);delete actor.summonedByCastId;for(const entry of actor.activeFx||[])if(entry.arcanumFeyTarget&&entry.castId===castId){entry.castId='released:'+castId;entry.conc=false;}castLogLine(actor.n+': концентрация прервана — существо стало враждебным до конца срока призыва.');}
 }
}
async function arcanumAction(actionId,prepare,commit){
 const result=await combatActionKernel.execute({actionId},{resolve:async()=>null,context:async()=>null,validate:async()=>{const p=prepare();if(!p.ok)throw Error(p.reason);return {allowed:true};},snapshot:async()=>gameActionTransactionSnapshot(),prepare:async()=>prepare(),
  commit:async(p,token)=>token.commit(actionId,()=>{const fresh=prepare();if(!fresh.ok)throw Error(fresh.reason);commit(fresh);fxInvalidate();return {success:true,message:'Действие учтено и сохранено.'};}),consequences:async r=>r,
  persist:async()=>{scheduleSave();clearTimeout(saveTimer);return await runScheduledSave()?{ok:true,receipt:campaignLastPersistenceReceipt}:{ok:false,reason:'Не удалось сохранить действие; изменения восстановлены.'};},rollback:async s=>gameActionTransactionRestore(s),reject:e=>({success:false,message:String(e.message||e)})});
 setStatus(result.message,!result.success);renderChars();renderFoes();renderCombat();return result;
}
function arcanumCommand(casterId,input){
 const stamp=arcanumTurnStamp(),prepare=()=>{
  if(arcanumTurnStamp()!==stamp)return {ok:false,reason:'Ход изменился.'};
  const caster=getCh(casterId);if(!caster)return {ok:false,reason:'Заклинатель не найден.'};
  const plan=globalThis.DND_ARCANUM_SUMMONS.planCommand({casterId,round:fxRound},input,foesDB);if(!plan.ok)return plan;
  if(combat.active&&!combatCanSpendPure(plan.cost==='none'?'turnfree':plan.cost,'ally:'+casterId))return {ok:false,reason:'Приказ недоступен в этот момент хода.'};return plan;
 };
 return arcanumAction('arcanum-command:'+casterId,prepare,p=>{if(combat.active&&!combatSpend(p.cost==='none'?'turnfree':p.cost,'Приказ призванным существам','ally:'+casterId))throw Error('Действие недоступно.');p.updates.forEach(actor=>Object.assign(foeOf(actor.id),actor));castLogLine('Приказ: '+input.command);});
}
function arcanumRetarget(castId,input){
 const initial=arcanumFindCast(castId),token=initial&&JSON.stringify(initial.state),stamp=input.turnStamp??arcanumTurnStamp();
 const prepare=()=>{
  const row=arcanumFindCast(castId);if(!row||JSON.stringify(row.state)!==token||arcanumTurnStamp()!==stamp)return {ok:false,reason:'Заклинание или ход изменились.'};
  if(effectiveConditions(row.holder).includes('Ослепленный'))return {ok:false,reason:'Заклинатель ослеплён и не видит новую цель.'};
  const key='ally:'+row.state.casterId;if(arcanumSuppressed(row.holder,row.entry))return {ok:false,reason:'Дурной глаз подавлен антимагией.'};if(!combatCanSpendPure('action',key))return {ok:false,reason:'Нужно свободное действие заклинателя.'};
  const spec=arcanumSaveSpec(input.targetKey,{key:'wis',dc:row.state.dc,magic:true},row.entry.label);
  if(!spec||input.specToken&&input.specToken!==spec.token||spec.rows.some(r=>!Number.isInteger(input.values?.[r.key])||input.values[r.key]<r.min||input.values[r.key]>r.max))return {ok:false,reason:'Введите все кости спасброска цели; изменённую формулу нужно открыть заново.'};
  const target=arcanumConditionTarget(input.targetKey,input.facts,{saveMade:true,saveOk:!spec.save.autoFail&&spec.total(input.values)>=row.state.dc,saveTotal:spec.total(input.values),saveAutoFail:spec.save.autoFail});
  const plan=globalThis.DND_ARCANUM_CONDITIONS.planRetarget(row.state,{eventId:input.eventId||'retarget:'+stamp+':'+row.state.revision,target,mode:input.mode});return plan.ok?{ok:true,row,plan,spec}:plan;
 };
 return arcanumAction('eyebite:'+castId,prepare,p=>{if(combat.active&&!combatSpend('action','Дурной глаз: новая цель','ally:'+p.row.state.casterId))throw Error('Действие недоступно.');const applied=globalThis.DND_ARCANUM_CONDITIONS.applyPlan(p.row.state,p.plan);if(!applied.ok)throw Error(applied.reason);p.row.entry.arcanumCast=applied.state;arcanumProjectCondition(p.row.entry);arcanumConsumeSaveFx(p.spec.ti.obj,p.spec.save.consumeTargetFx||[]);castLogLine('Дурной глаз: '+p.spec.ti.name+' · '+(p.spec.total(input.values)??'автоматический провал'));});
}
function arcanumRetargetOpen(castId){
 const row=arcanumFindCast(castId);if(!row)return false;
 try{
  const targetKey=arcanumChoose('Новая цель «Дурного глаза»',chars.map(c=>({value:'ally:'+c.id,label:c.name})).concat(foesDB.filter(f=>f.hp>0).map(f=>({value:'foe:'+f.id,label:f.n}))).filter(x=>!row.state.immuneTargetIds.includes(x.value)&&!row.state.targets.some(t=>t.targetId===x.value&&t.status==='active')));
  const mode=arcanumChoose('Эффект',[{value:'asleep',label:'Сон'},{value:'panicked',label:'Паника'},{value:'sickened',label:'Дурнота'}]),facts={visible:arcanumPromptBool('Заклинатель видит цель'),distanceM:arcanumPromptNumber('Дистанция до цели, м')},spec=arcanumSaveSpec(targetKey,{key:'wis',dc:row.state.dc,magic:true},row.entry.label),turnStamp=arcanumTurnStamp();
  if(!spec)throw Error('Не удалось определить спасбросок.');
  askRolls({title:'Дурной глаз — '+spec.ti.name,note:'Действие без расхода арканума. Мудрость против СЛ '+row.state.dc,rows:spec.rows,compute:v=>spec.total(v)+' против СЛ '+row.state.dc,apply:values=>arcanumRetarget(castId,{targetKey,mode,facts,values,specToken:spec.token,turnStamp})});return true;
 }catch(error){setStatus(error.message==='cancelled'?'Выбор отменён; действие не потрачено.':error.message,true);return false;}
}
function arcanumControls(holder){
 const key=(foesDB.includes(holder)?'foe:':'ally:')+holder.id,button=(label,fn,args)=>'<button class="btn ghost sm" type="button" onclick="'+fn+'('+args.map(x=>esc(JSON.stringify(x))).join(',')+')">'+esc(label)+'</button>';
 let h='';
 for(const {entry,state} of arcanumCastMarkers()){
  if(state.casterId===holder.id&&state.spell==='eyebite'&&state.status==='active')h+=button('Дурной глаз: новая цель','arcanumRetargetOpen',[state.castId]);
  const target=state.targets.find(t=>t.targetId===key&&['active','permanent'].includes(t.status));if(!target)continue;
  h+='<div class="uses-box"><b>'+esc(entry.label)+'</b>';
  if(target.mode==='restrained')h+=' · успехи '+target.successes+'/3 · провалы '+target.failures+'/3';
  if(target.mode==='asleep')h+=button('Разбудить действием','arcanumControlOpen',[state.castId,'wake',key]);
  if(target.mode==='panicked')h+=button('Проверить расстояние и видимость','arcanumControlOpen',[state.castId,'position',key]);
  if(target.mode==='suggested'){h+='<p>'+esc(state.order)+'</p>';h+=button(target.taskStatus==='waiting'?'Условие внушения наступило':'Внушение выполнено','arcanumControlOpen',[state.castId,target.taskStatus==='waiting'?'taskTriggered':'taskComplete',key]);}
  if(target.mode==='petrified')h+=button('Повреждение каменного тела','arcanumControlOpen',[state.castId,'physicalBreak',key]);
  h+='</div>';
 }
 const summons=foesDB.filter(f=>f.arcanumSummon?.casterId===holder.id&&f.arcanumSummon.controlled&&f.hp>0);
 if(summons.length)h+=button('Приказ призванным существам','arcanumCommandOpen',[holder.id]);
 if(holder.arcanumSummon){const s=holder.arcanumSummon,remaining=Math.max(0,(s.expiresAtRound||s.controlExpiresAtRound)-fxRound);h+='<p class="note-ital">'+esc(s.controlled?'Под контролем заклинателя':'Больше не подчиняется: враждебное существо')+' · '+Math.ceil(remaining/10)+' мин. '+esc(s.command||'Приказ не задан; защищается от враждебных существ.')+'</p>';}
 return h?'<div class="arcanum-controls">'+h+'</div>':'';
}
function arcanumControlOpen(castId,type,targetId){
 const row=arcanumFindCast(castId);if(!row)return false;
 try{
  const event={type,targetId,eventId:fxUid()},token=JSON.stringify(row.state),stamp=arcanumTurnStamp();let actorKey='';
  if(type==='wake'){
   actorKey=combat.active?combatCurrentKey():arcanumChoose('Кто тратит действие, чтобы разбудить цель',chars.map(c=>({label:c.name,value:'ally:'+c.id})).concat(foesDB.filter(f=>f.hp>0).map(f=>({label:f.n,value:'foe:'+f.id}))));event.actorId=actorKey;
  }
  if(type==='position'){event.distanceFeet=arcanumPromptNumber('Расстояние до заклинателя, м')/0.3048;event.canSeeCaster=arcanumPromptBool('Цель видит заклинателя');}
  if(type==='physicalBreak')event.description=arcanumPromptText('Как повреждено каменное тело? Повреждение останется и после снятия окаменения');
  const prepare=()=>{const current=arcanumFindCast(castId);if(!current||JSON.stringify(current.state)!==token||arcanumTurnStamp()!==stamp)return {ok:false,reason:'Эффект или ход изменились.'};if(type==='wake'&&!combatCanSpendPure('action',actorKey))return {ok:false,reason:'Нужно действие другого дееспособного существа.'};return globalThis.DND_ARCANUM_CONDITIONS.planEvent(current.state,event);};
  return arcanumAction('arcanum-event:'+event.eventId,prepare,()=>{if(type==='wake'&&combat.active&&!combatSpend('action','Разбудить',actorKey))throw Error('Действие недоступно.');const r=arcanumConditionEvent(castId,event);if(!r.ok)throw Error(r.reason);if(type==='physicalBreak'){const target=targetInfoOf(targetId).obj;target.notes=(target.notes?target.notes+'\n':'')+'Повреждение окаменевшего тела: '+event.description;}castLogLine(row.entry.label+': '+targetInfoOf(targetId).name+' — '+({wake:'разбужен',position:'проверены расстояние и видимость',taskComplete:'внушение выполнено',taskTriggered:'условие наступило',physicalBreak:'учтено повреждение'}[type]||type));});
 }catch(error){setStatus(error.message==='cancelled'?'Действие отменено.':error.message,true);return false;}
}
function arcanumCommandOpen(casterId){
 try{
  const actors=foesDB.filter(f=>f.arcanumSummon?.casterId===casterId&&f.arcanumSummon.controlled&&f.hp>0),kind=arcanumChoose('Кому отдать приказ',[...new Set(actors.map(f=>f.arcanumSummon.kind))].map(k=>({value:k,label:k==='conjureFey'?'Призванной фее':'Созданным гулям'}))),targets=actors.filter(f=>f.arcanumSummon.kind===kind);
  const input={command:arcanumPromptText('Общий приказ выбранным существам'),targetIds:[],distancesFeet:{}};
  for(const target of targets)if(arcanumPromptBool('Включить '+target.n+' в этот приказ')){input.targetIds.push(target.id);if(kind==='createUndead')input.distancesFeet[target.id]=arcanumPromptNumber('Расстояние до '+target.n+', м')/0.3048;}
  if(kind==='conjureFey'){input.verbalConfirmed=arcanumPromptBool('Фея слышит устный приказ');input.alignmentConfirmed=arcanumPromptBool('Приказ согласуется с мировоззрением феи');}return arcanumCommand(casterId,input);
 }catch(error){setStatus(error.message==='cancelled'?'Приказ отменён.':error.message,true);return false;}
}

// Persist the receipt on the turn, not on a transient dialog. Cancelling a later
// prompt or reloading must never grant a second attempt at the same saving throw.
function arcanumTurnStamp(){return combat.active&&combat.turn?JSON.stringify([combat.id,combat.round,combatCurrentKey(),combat.turn.startedAt]):'world:'+fxRound;}
function arcanumRepeatResolved(entry){return !!(entry.arcanumRepeat&&(combat.active?combat.turn?.repeatSaveReceipts?.[entry.uid]:entry.arcanumWorldSaveAt===fxRound));}
function arcanumUpgradeStun(holder){
 for(const entry of holder.activeFx||[]){
  if(entry.arcanumRepeat||entry.k!=='spell'||entry.id!=='sp_слово_силы_оглушение'||!(entry.fx||[]).some(f=>f.stat==='condition'&&canonicalCondition(f.value)==='Ошеломленный'))continue;
  const spell=spellOf(entry.id),caster=getCh(entry.casterId);if(spell?.mechanics?.special!=='powerWordStun'||!caster)continue;
  entry.repeatSave={when:'end',key:'con',dc:entry.saveDC||spellDC(caster),magic:true};entry.arcanumRepeat=true;
  delete entry.expiresAtRound;entry.durationKind='manual';entry.durationLabel='до успешного спасброска Телосложения';
 }
}
function arcanumPendingRepeatSaves(key){
 const holder=combatActorByKey(key);if(!holder)return [];arcanumUpgradeStun(holder);
 if(key.startsWith('foe:')&&holder.hp<=0||key.startsWith('ally:')&&holder.deaths?.f>=3)return [];
 return (holder.activeFx||[]).filter(entry=>entry.arcanumRepeat&&entry.repeatSave?.when==='end'&&!arcanumRepeatResolved(entry)&&!arcanumSuppressed(holder,entry));
}
function arcanumSuppressed(holder,entry){return entry?.k==='spell'&&(holder?.activeFx||[]).some(e=>e.antimagic);}
function arcanumSaveSpec(key,rule,label){
 const ti=targetInfoOf(key);if(!ti.obj||!ti.known||typeof ti.saveMod!=='function'||!AB_FULL[rule.key]||!Number.isFinite(rule.dc)||rule.dc<1)return null;
 const spec={rows:[],meta:{}};
 recipeTabletopAppendSave(spec,null,ti,{key:'ongoing',rule:'ongoing',item:{n:label,mechanics:{profile:{flags:{magical:!!rule.magic}}}},hit:{save:rule}});
 const save=spec.meta.recipeHits[0];
 // The recipe helper covers ability/all saves but has no spell-context tags.
 // Include the same tagged defenses as an initial spell save, without adding
 // the ability/all flat bonuses twice (they are already in ti.saveMod).
 const tags=[...new Set([].concat(rule.tags||[],rule.magic?['magical']:[]))],baseStats=['save.'+rule.key,'save','save.all'];
 const allFx=ti.kind==='ally'?rollFxEntries(ti.obj,'save.'+rule.key,tags):holderFxEntries(ti.obj).filter(f=>baseStats.includes(f.stat)||tags.some(tag=>f.stat==='save.'+tag));
 const contextualFx=allFx.filter(f=>!baseStats.includes(f.stat)&&tags.some(tag=>f.stat==='save.'+tag)),mode=saveConditionMode(ti,rule.key,{magic:!!rule.magic});
 const hasAdv=mode.adv||allFx.some(f=>f.mode==='adv'),hasDis=mode.dis||allFx.some(f=>f.mode==='dis');
 save.adv=hasAdv===hasDis?0:hasAdv?1:2;
 save.mod+=contextualFx.filter(f=>f.mode==='add').reduce((sum,f)=>sum+(+f.value||0),0);
 save.consumeTargetFx=[...new Set(save.consumeTargetFx.concat(contextualFx.filter(f=>f.consume==='roll'&&f.sourceUid).map(f=>f.sourceUid)))];
 const natural=spec.rows.find(row=>row.key===save.rowKey);natural.adv=save.adv;natural.mod=save.mod;
 contextualFx.filter(f=>f.mode==='die').forEach((f,i)=>{
  const dice=normDiceInput(String(f.value||'')).match(/^(-)?(\d*)d(\d+)$/);if(!dice)return;
  const rowKey=save.rowKey+'_context'+i,cnt=Math.max(1,+dice[2]||1),sides=+dice[3];
  save.dice.push({key:rowKey,sign:dice[1]?-1:1});spec.rows.push({key:rowKey,type:'recipe',side:'target',cnt,sides,required:true,label:(f.label||'Защита от магии')+': '+(dice[1]?'-':'')+cnt+'d'+sides});
 });
 const rows=save.autoFail?[]:spec.rows.flatMap(r=>[{key:r.key,label:r.label,min:r.cnt||1,max:r.sides?r.cnt*r.sides:20},...(r.adv?[{key:r.key+'_2',label:'Второй d20 ('+(r.adv===1?'преимущество':'помеха')+')',min:1,max:20}]:[])]);
 const total=values=>save.autoFail?null:pickNat(values,save.rowKey,save.adv)+save.mod+save.dice.reduce((n,d)=>n+values[d.key]*d.sign,0);
 return {ti,save,rows,total,token:JSON.stringify({rule,save,rows})};
}
async function arcanumRepeatCommit(key,uid,stamp,opened,values){
 const fail=message=>({success:false,message});
 const fresh=()=>{
  const holder=combatActorByKey(key),entry=holder?.activeFx?.find(e=>e.uid===uid);
  if(combat.active&&combatCurrentKey()!==key||arcanumTurnStamp()!==stamp||!entry||arcanumRepeatResolved(entry)||arcanumSuppressed(holder,entry))throw Error('Этот спасбросок уже учтён или ход и эффект изменились.');
  const spec=arcanumSaveSpec(key,entry.repeatSave,entry.label);
  if(!spec||spec.token!==opened.token)throw Error('Модификаторы спасброска изменились. Откройте запрос заново.');
  const decline=values.__decline===true&&entry.arcanumMode==='sickened'&&!!entry.arcanumConditionCast;
  if(!decline&&spec.rows.some(r=>!Number.isInteger(values[r.key])||values[r.key]<r.min||values[r.key]>r.max))throw Error('Введите все реальные результаты костей в указанных пределах.');
  return {holder,entry,spec};
 };
 const result=await combatActionKernel.execute({actionId:'repeat-save:'+stamp+':'+uid},{
  resolve:async()=>null,context:async()=>null,validate:async()=>{fresh();return {allowed:true};},snapshot:async()=>gameActionTransactionSnapshot(),prepare:async()=>fresh(),
  commit:async(_p,token)=>token.commit('repeat-save',()=>{
   const {holder,entry,spec}=fresh(),decline=values.__decline===true&&entry.arcanumMode==='sickened',dc=entry.repeatSave.dc,total=decline?null:spec.total(values),ok=!decline&&!spec.save.autoFail&&total>=dc;
   if(combat.active){combat.turn.repeatSaveReceipts=combat.turn.repeatSaveReceipts||{};combat.turn.repeatSaveReceipts[uid]={total,success:ok,dc:entry.repeatSave.dc,values:mechanicsClone(values)};}
   entry.arcanumWorldSaveAt=fxRound;
   if(entry.arcanumConditionCast)arcanumConditionRepeatApply(entry,key,ok,total,stamp,decline);
   else if(ok){detachActiveFx(holder,entry);holder.activeFx=holder.activeFx.filter(e=>e.uid!==uid);recipeTabletopEffectEnded(holder,entry);}
   if(!decline)arcanumConsumeSaveFx(holder,spec.save.consumeTargetFx||[]);
   const message=spec.ti.name+': '+entry.label+' — '+(decline?'необязательный спасбросок не совершён':(total==null?'автоматический провал':total+' против СЛ '+dc)+'; '+(ok?'успех':'провал'));
   combatLog(message,'change',key);fxInvalidate();return {success:true,message};
  }),consequences:async r=>r,
  persist:async()=>{scheduleSave();clearTimeout(saveTimer);return await runScheduledSave()?{ok:true,receipt:campaignLastPersistenceReceipt}:{ok:false,reason:'Спасбросок не сохранён. Состояние восстановлено; повторите ввод тех же костей.'};},
  rollback:async snapshot=>gameActionTransactionRestore(snapshot),reject:error=>fail(String(error.message||error))
 });
 setStatus(result.message,!result.success);renderChars();renderFoes();renderCombat();return result;
}
function arcanumRepeatSaveOpen(key,row,next){
 if(combat.active&&combatCurrentKey()!==key)return false;
 const entry=combatActorByKey(key)?.activeFx?.find(e=>e.uid===row.entry.uid);
 if(!entry||arcanumRepeatResolved(entry)){next();return true;}
 const spec=arcanumSaveSpec(key,entry.repeatSave,entry.label),stamp=arcanumTurnStamp();
 if(!spec){setStatus('Невозможно определить спасбросок эффекта «'+entry.label+'». Ход не завершён.',true);return false;}
 askRolls({title:'Повторный спасбросок — '+spec.ti.name,note:entry.label+': '+AB_FULL[entry.repeatSave.key]+' '+fmtMod(spec.save.mod)+' против СЛ '+entry.repeatSave.dc+(spec.save.autoFail?' · автоматически провален по состоянию цели':''),rows:spec.rows,
  ...(entry.arcanumMode==='sickened'?{onDecline:async()=>{const result=await arcanumRepeatCommit(key,entry.uid,stamp,spec,{__decline:true});if(result.success)next();return result.success;}}:{}),
  compute:values=>spec.save.autoFail?'Автоматический провал':spec.total(values)+' против СЛ '+entry.repeatSave.dc,
  apply:async values=>{const result=await arcanumRepeatCommit(key,entry.uid,stamp,spec,values);if(result.success)next();return result.success;},
  onCancel:()=>setStatus('Ход не завершён. Повторный спасбросок будет запрошен снова при завершении хода.')});return true;
}
function arcanumConsumeSaveFx(holder,ids){
 if(foesDB.includes(holder)){const removed=new Set(ids);holder.activeFx=(holder.activeFx||[]).filter(e=>!removed.has(e.uid));fxInvalidate();}
 else consumeRollFx(holder,ids);
}
function arcanumTimeGate(steps,combatTransition){
 const actors=chars.map(c=>'ally:'+c.id).concat(foesDB.map(f=>'foe:'+f.id)),pending=actors.flatMap(key=>arcanumPendingRepeatSaves(key).map(entry=>({key,entry})));
 if(!pending.length)return true;
 if(combat.active){if(combatTransition)return true;setStatus('В активном бою завершайте ходы по очереди: сайт запросит повторные спасброски.',true);return false;}
 if(rollSpec){setStatus('Сначала завершите открытый запрос бросков.',true);return false;}
 const row=pending[0];arcanumRepeatSaveOpen(row.key,{entry:row.entry},()=>{advanceFxRound(steps);});return false;
}
function arcanumRemoveProjection(holder,entry,reason){
 if(entry.arcanumFey||entry.arcanumFeyTarget){
  if(reason!=='dispel'&&entry.arcanumFey)arcanumConcentrationBreak(entry.castId);
  if(entry.arcanumFeyTarget){const original=holder.arcanumSummon?.castId;foesDB=foesDB.filter(f=>f!==holder);arcanumRepairSummonOrder();if(original)removeCastGroup(original);}
  removeCastGroup(entry.castId);arcanumRepairSummonOrder();
  // A released fey has no surviving cast group to trigger these updates for us.
  scheduleSave();renderChars();renderFoes();renderCombat();return true;
 }
 if(entry.arcanumCast){removeCastGroup(entry.castId);return true;}
 if(!entry.arcanumConditionCast)return false;
 const key=(foesDB.includes(holder)?'foe:':'ally:')+holder.id,result=arcanumConditionEvent(entry.arcanumConditionCast,{type:'remove',targetId:key});
 if(!result.ok)throw Error(result.reason);scheduleSave();renderChars();renderFoes();return true;
}
function arcanumPanicTurn(key,start){
 try{
  for(const row of arcanumCastMarkers().slice()){
   if(!row.state.targets.some(t=>t.targetId===key&&t.mode==='panicked'&&t.status==='active')||arcanumSuppressed(combatActorByKey(key),row.entry))continue;
   const distanceFeet=arcanumPromptNumber(combatActorName(key)+': расстояние до источника паники, м')/0.3048,canSeeCaster=arcanumPromptBool(combatActorName(key)+' видит заклинателя «Дурного глаза»');
   const checked=arcanumConditionEvent(row.state.castId,{type:'position',targetId:key,distanceFeet,canSeeCaster});if(!checked.ok)throw Error(checked.reason);
   const active=arcanumFindCast(row.state.castId)?.state.targets.some(t=>t.targetId===key&&t.mode==='panicked'&&t.status==='active');
   if(active&&start){
    if(arcanumPromptBool('Есть безопасный незаблокированный путь прочь от заклинателя')){
     combat.turn.actionsUsed=1;combat.turn.actionUsed=true;combat.turn.actionKind='dash';combat.turn.dash=true;
     combatLog(combatActorName(key)+': паника — действие потрачено на Рывок; двигайтесь самым коротким безопасным путём прочь от заклинателя.','change',key);
    }else combatLog(combatActorName(key)+': путь отхода заблокирован, обязательный Рывок не применяется.','change',key);
   }
  }return true;
 }catch(error){setStatus(error.message==='cancelled'?'Уточнение паники отменено; ход не изменён.':error.message,true);return false;}
}
function arcanumActivityStamp(){return JSON.stringify([journal.length,journal.reduce((n,j)=>n+String(j.text||'').length,0),combat.log?.length||0]);}
function arcanumRestTime(caster,kind){
 const steps=kind==='long'?4800:600,window= combat.arcanumRestWindow;
 if(window&&window.kind===kind&&window.end===fxRound&&window.activity===arcanumActivityStamp()&&!window.actors.includes(caster.id)){window.actors.push(caster.id);return true;}
 const relevant=arcanumCastMarkers().some(r=>r.state.status==='active')||foesDB.some(f=>f.arcanumSummon&&(f.arcanumSummon.controlled||f.arcanumSummon.kind==='conjureFey'))||chars.concat(foesDB).some(h=>(h.activeFx||[]).some(e=>e.arcanumRepeat));
 const pending=combat.arcanumRestPending;
 if(!relevant&&!pending)return true;
 if(pending&&(pending.actorId!==caster.id||pending.kind!==kind)){setStatus('Сначала завершите уже начатый учёт времени отдыха.',true);return false;}
 if(!pending){
  // Rest ends concentration before its elapsed time can make petrification permanent.
  if(kind==='long'&&concLabelOf(caster))breakConcentration(caster,'начат отдых');
  combat.arcanumRestPending={actorId:caster.id,kind,end:fxRound+steps};
 }
 const end=combat.arcanumRestPending.end,remaining=end-fxRound;
 if(remaining>0&&advanceFxRound(remaining)===false){scheduleSave();return false;}
 combat.arcanumRestWindow={kind,end:fxRound,actors:[caster.id],activity:arcanumActivityStamp()};delete combat.arcanumRestPending;return true;
}
function arcanumRestFinished(){if(combat.arcanumRestWindow?.end===fxRound)combat.arcanumRestWindow.activity=arcanumActivityStamp();}

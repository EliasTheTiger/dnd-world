(function arcanumSummonsModule(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DND_ARCANUM_SUMMONS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function arcanumSummonsFactory(){
  'use strict';
  // SRD 5.1: Conjure Fey / Create Undead. The adapter owns resource payment,
  // action economy, actual inventory checks, initiative insertion and persistence.
  // Every operation here is a pure preflight: rejected input never changes actors.
  const HOUR_ROUNDS=600,DAY_ROUNDS=14400,SCHEMA='arcanum-summon/1';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=(code,reason)=>({ok:false,code,reason});
  const text=value=>typeof value==='string'?value.trim():'';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const roundOK=value=>Number.isSafeInteger(value)&&value>=0;
  const normalized=value=>text(value).toLowerCase().replace(/ё/g,'е');
  function challengeRating(value){
    if(finite(value))return value>=0?value:null;
    const raw=text(value),fraction=/^(\d+)\/(\d+)$/.exec(raw);
    if(fraction)return +fraction[2]>0?+fraction[1]/+fraction[2]:null;
    return /^\d+(?:\.\d+)?$/.test(raw)?+raw:null;
  }
  function creatureKind(template){
    const kind=normalized(template&&template.creatureType);
    if(['fey','фея','феи'].includes(kind))return 'fey';
    if(['beast','зверь'].includes(kind))return 'beast';
    if(['humanoid','гуманоид'].includes(kind))return 'humanoid';
    if(['undead','нежить'].includes(kind))return 'undead';
    return kind;
  }
  function templateCheck(template){
    if(!template||!text(template.id)||!text(template.n||template.name)||!finite(template.hpMax)||template.hpMax<=0||
      !finite(template.ac)||!template.abil||!finite(template.abil.dex)||!Array.isArray(template.combatActions))
      return fail('template-invalid','Нужна полная карточка существа с характеристиками и действиями.');
    return {ok:true};
  }
  function feyCandidates(catalog,slotLevel=6){
    if(!Number.isInteger(slotLevel)||slotLevel<6||slotLevel>9)return [];
    return (Array.isArray(catalog)?catalog:[]).filter(row=>templateCheck(row).ok&&
      ['fey','beast'].includes(creatureKind(row))&&challengeRating(row.cr)!==null&&challengeRating(row.cr)<=slotLevel);
  }
  function contextCheck(context){
    if(!context||!text(context.casterId)||!text(context.castId)||!roundOK(context.round))
      return fail('context-invalid','Не удалось определить заклинателя, применение или игровое время.');
    const level=context.slotLevel==null?6:context.slotLevel;
    if(!Number.isInteger(level)||level<6||level>9)return fail('level-invalid','Нужен круг заклинания от 6 до 9.');
    return {ok:true,level};
  }
  function initiative(template,die){
    if(!Number.isInteger(die)||die<1||die>20)return fail('initiative-required','Введите выпавший d20 инициативы призванного существа (1–20).');
    const modifier=Math.floor((template.abil.dex-10)/2);
    return {ok:true,die,modifier,total:die+modifier};
  }
  function freshActor(template,id){
    const actor=clone(template);
    for(const key of ['summonedByCastId','summonedExpiresAtRound','summonerId','summonSide','createdByCastId','arcanumSummon','__fxC'])delete actor[key];
    return Object.assign(actor,{id,builtin:false,hp:template.hpMax,hpTemp:0,activeFx:[],cond:[],actionState:{}});
  }
  function actorId(castId,suffix){return 'arcanum_'+encodeURIComponent(castId)+'_'+encodeURIComponent(suffix);}
  function planConjureFey(context,input,catalog){
    const checked=contextCheck(context);if(!checked.ok)return checked;
    input=input||{};
    const template=feyCandidates(catalog,checked.level).find(row=>row.id===input.templateId);
    if(!template)return fail('fey-choice-invalid','Выберите фею или зверя допустимой опасности из каталога.');
    if(input.positionConfirmed!==true)return fail('position-required','Подтвердите видимое свободное место в пределах 27 м.');
    const roll=initiative(template,input.initiativeDie);if(!roll.ok)return roll;
    const id=actorId(context.castId,'fey'),actor=freshActor(template,id);
    actor.creatureType='фея';actor.tags=[...(actor.tags||[]).filter(tag=>tag!=='beast'),'fey'];
    actor.summonedByCastId=context.castId;actor.summonerId=context.casterId;actor.summonSide='ally';
    actor.summonedExpiresAtRound=context.round+HOUR_ROUNDS;
    actor.arcanumSummon={schemaVersion:SCHEMA,kind:'conjureFey',castId:context.castId,casterId:context.casterId,
      templateId:template.id,createdRound:context.round,expiresAtRound:context.round+HOUR_ROUNDS,
      controlled:true,command:null,revision:0,initiative:{die:roll.die,modifier:roll.modifier,total:roll.total}};
    return {ok:true,kind:'conjureFey',castingRounds:10,actors:[actor],consume:[],concentration:true,
      initiatives:[{id,die:roll.die,modifier:roll.modifier,total:roll.total}]};
  }
  function materialsPlan(input,count){
    const materials=input.materials||{};
    if(materials.graveDirtPot!==true||materials.brackishWaterPot!==true)
      return fail('materials-required','Нужны глиняный горшок с кладбищенской землей и горшок с солоноватой водой.');
    if(!Array.isArray(materials.onyxStones)||materials.onyxStones.length<count)
      return fail('onyx-required','Для каждого трупа нужен отдельный черный оникс стоимостью не менее 150 зм.');
    const stones=materials.onyxStones.slice(0,count),ids=stones.map(stone=>stone&&text(stone.id));
    if(ids.some(id=>!id)||new Set(ids).size!==count||stones.some(stone=>!finite(stone.valueGp)||stone.valueGp<150))
      return fail('onyx-invalid','Укажите отдельные черные ониксы стоимостью не менее 150 зм каждый.');
    // Neither spell says these materials are consumed. A price is not consumption.
    return {ok:true,required:{graveDirtPot:1,brackishWaterPot:1,onyxStones:clone(stones)},consume:[]};
  }
  function planCreateUndead(context,input,catalog,existingActors=[]){
    const checked=contextCheck(context);if(!checked.ok)return checked;
    if(checked.level!==6)return fail('undead-level-unsupported','Этот обработчик создает гулей арканумом 6-го круга.');
    input=input||{};
    if(input.night!==true)return fail('night-required','Создание нежити возможно только ночью. Подтвердите время в игре.');
    if(!['create','renew'].includes(input.mode))return fail('mode-required','Выберите создание гулей или продление контроля.');
    const selected=input.mode==='renew'?input.targetIds:input.corpses;
    if(!Array.isArray(selected)||selected.length<1||selected.length>3)
      return fail('targets-invalid','Выберите от одного до трех трупов или подконтрольных гулей.');
    const ids=selected.map(row=>input.mode==='renew'?text(row):text(row&&row.id));
    if(ids.some(id=>!id)||new Set(ids).size!==ids.length)return fail('duplicate-target','Каждое существо можно выбрать только один раз.');
    const materials=materialsPlan(input,selected.length);if(!materials.ok)return materials;
    if(input.mode==='renew'){
      const updates=[];
      for(const id of ids){
        const current=existingActors.find(row=>row.id===id),state=current&&current.arcanumSummon;
        if(!state||state.schemaVersion!==SCHEMA||state.kind!=='createUndead'||state.casterId!==context.casterId||
          state.controlled!==true||!roundOK(state.controlExpiresAtRound)||state.controlExpiresAtRound<=context.round||!(current.hp>0))
          return fail('renew-invalid','Контроль можно продлить только над своим живым гулем до истечения текущих 24 часов.');
        if(!input.withinRange||input.withinRange[id]!==true)return fail('range-required','Все выбранные гули должны находиться в пределах 3 м.');
        const actor=clone(current);
        actor.arcanumSummon.controlExpiresAtRound=context.round+DAY_ROUNDS;
        actor.arcanumSummon.lastRenewalCastId=context.castId;
        actor.arcanumSummon.revision=(state.revision||0)+1;
        updates.push(actor);
      }
      return {ok:true,kind:'createUndead',mode:'renew',castingRounds:10,actors:[],updates,consume:[],materials:materials.required,concentration:false};
    }
    const template=(Array.isArray(catalog)?catalog:[]).find(row=>row.id==='foe_ghoul');
    if(!templateCheck(template).ok||creatureKind(template)!=='undead')return fail('ghoul-template-missing','В каталоге отсутствует полная карточка гуля.');
    const actors=[],initiatives=[];
    for(const corpse of selected){
      if(corpse.isCorpse!==true||!finite(corpse.hp)||corpse.hp>0||creatureKind(corpse)!=='humanoid'||
        !['medium','small','средний','маленький','малый'].includes(normalized(corpse.size))||corpse.withinRange!==true||corpse.animatedByCastId)
        return fail('corpse-invalid','Нужен неиспользованный труп маленького или среднего гуманоида в пределах 3 м.');
      const roll=initiative(template,input.initiativeDice&&input.initiativeDice[corpse.id]);if(!roll.ok)return roll;
      const id=actorId(context.castId,corpse.id),actor=freshActor(template,id);
      actor.summonerId=context.casterId;actor.summonSide='ally';actor.createdByCastId=context.castId;
      actor.arcanumSummon={schemaVersion:SCHEMA,kind:'createUndead',castId:context.castId,casterId:context.casterId,
        templateId:template.id,corpseId:corpse.id,createdRound:context.round,controlExpiresAtRound:context.round+DAY_ROUNDS,
        controlled:true,command:null,revision:0,initiative:{die:roll.die,modifier:roll.modifier,total:roll.total}};
      actors.push(actor);initiatives.push({id,die:roll.die,modifier:roll.modifier,total:roll.total});
    }
    return {ok:true,kind:'createUndead',mode:'create',castingRounds:10,actors,initiatives,updates:[],
      corpseUpdates:ids.map(id=>({id,animatedByCastId:context.castId})),consume:[],materials:materials.required,concentration:false};
  }
  function lifecycle(actor,event){
    const state=actor&&actor.arcanumSummon;
    if(!state)return {ok:true,operation:'keep',actor};
    if(state.schemaVersion!==SCHEMA||!['conjureFey','createUndead'].includes(state.kind)||!event||!roundOK(event.round))
      return fail('lifecycle-invalid','Повреждены данные призыва или игрового времени.');
    if(state.kind==='conjureFey'){
      if(!roundOK(state.expiresAtRound))return fail('expiry-invalid','Не определено время окончания призыва.');
      if(actor.hp<=0||event.round>=state.expiresAtRound||event.spellEnded===true)
        return {ok:true,operation:'remove',actorId:actor.id,reason:actor.hp<=0?'zero-hp':'spell-ended'};
      if(event.dismiss===true)return fail('dismiss-unavailable','Прекращение концентрации освобождает фею от контроля, но не изгоняет ее.');
      if(event.concentrationLost===true&&state.controlled===true){
        const updated=clone(actor);updated.summonSide='enemy';updated.arcanumSummon.controlled=false;
        updated.arcanumSummon.command=null;updated.arcanumSummon.revision=(state.revision||0)+1;
        return {ok:true,operation:'update',actor:updated,reason:'concentration-lost'};
      }
    }else{
      if(!roundOK(state.controlExpiresAtRound))return fail('expiry-invalid','Не определено время окончания контроля нежити.');
      if(state.controlled===true&&(event.round>=state.controlExpiresAtRound||actor.hp<=0)){
        const updated=clone(actor);updated.summonSide='enemy';updated.arcanumSummon.controlled=false;
        updated.arcanumSummon.command=null;updated.arcanumSummon.revision=(state.revision||0)+1;
        return {ok:true,operation:'update',actor:updated,reason:actor.hp<=0?'undead-dead':'control-expired'};
      }
    }
    return {ok:true,operation:'keep',actor};
  }
  function planCommand(context,input,actors){
    if(!context||!text(context.casterId)||!roundOK(context.round))return fail('context-invalid','Не определены заклинатель и игровое время.');
    input=input||{};
    if(!text(input.command)||!Array.isArray(input.targetIds)||!input.targetIds.length||new Set(input.targetIds).size!==input.targetIds.length)
      return fail('command-required','Выберите существ и укажите общий приказ.');
    const updates=[];let kind=null;
    for(const id of input.targetIds){
      const actor=actors.find(row=>row.id===id),state=actor&&actor.arcanumSummon;
      if(!state||state.casterId!==context.casterId||state.controlled!==true||!(actor.hp>0))return fail('control-required','Это существо не находится под вашим контролем.');
      const current=lifecycle(actor,{round:context.round});
      if(!current.ok||current.operation!=='keep')return fail('control-expired','Срок призыва или контроля уже истек.');
      if(kind&&state.kind!==kind)return fail('command-kind-mismatch','Отдайте отдельные приказы фее и нежити.');
      kind=state.kind;
      if(kind==='conjureFey'&&(input.verbalConfirmed!==true||input.alignmentConfirmed!==true))
        return fail('fey-command-required','Фея должна слышать устный приказ; приказ не должен противоречить ее мировоззрению.');
      if(kind==='createUndead'&&(!input.distancesFeet||!finite(input.distancesFeet[id])||input.distancesFeet[id]<0||input.distancesFeet[id]>120))
        return fail('command-range','Мысленный приказ доступен только нежити в пределах 36 м.');
      const updated=clone(actor);updated.arcanumSummon.command=text(input.command);
      updated.arcanumSummon.revision=(state.revision||0)+1;updates.push(updated);
    }
    return {ok:true,updates,cost:kind==='createUndead'?'bonus':'none',command:text(input.command)};
  }
  return Object.freeze({SCHEMA,HOUR_ROUNDS,DAY_ROUNDS,challengeRating,creatureKind,feyCandidates,
    planConjureFey,planCreateUndead,lifecycle,planCommand});
});

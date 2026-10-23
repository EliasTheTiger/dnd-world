'use strict';
// SRD 5.1 (2014), CC BY 4.0. Scene facts are supplied by the GM; this adapter
// never invents hidden properties, messages, creatures, investigation or saves.
// Reference: https://www.dndbeyond.com/attachments/39j2li89/SRD5.1-CCBY4.0License.pdf
function artificerUtilityDefinition(sp){
 if(!sp||sp.custom||sp.grimoire?.translation==='custom'||sp.mechanics?.origin==='editor'||sp.rulesetRef?.id==='dnd5e-2024-reference'||sp.catalogSource?.documentKey&&sp.catalogSource.documentKey!=='srd-2014'||sp.grimoire?.status&&sp.grimoire.status!=='active')return null;
 const name=String(sp?.open5e?.originalName||sp?.grimoire?.english||sp?.n||'').toLowerCase().replace(/[^a-zа-яё]/g,'');
 const rows=[['light','Light','Свет',1.524,600],['dancingLights','Dancing Lights','Пляшущие огоньки',36.576,10,true],['message','Message','Сообщение',36.576,0],['prestidigitation','Prestidigitation','Фокусы',3.048,600],['mageHand','Mage Hand','Волшебная рука',9.144,10],['mending','Mending','Починка',1.524,0,false,true],['detectMagic','Detect Magic','Обнаружение магии',0,100,true],['disguiseSelf','Disguise Self','Маскировка',0,600],['identify','Identify','Опознание',1.524,0,false,true],['purifyFoodDrink','Purify Food and Drink','Очищение пищи и питья',3.048,0],['alarm','Alarm','Сигнал тревоги',9.144,4800,false,true]];
 const row=rows.find(r=>[r[1],r[2]].some(n=>n.toLowerCase().replace(/[^a-zа-яё]/g,'')===name));
 return row?{key:row[0],name:row[2],range:row[3],rounds:row[4],concentration:!!row[5],minute:!!row[6]}:null;
}
function artificerUtilityLongCastSupported(sp){return !!artificerUtilityDefinition(sp)?.minute;}
function artificerUtilityReconcile(sp){
 const d=artificerUtilityDefinition(sp);if(!d||sp.custom||sp.grimoire?.translation==='custom'||sp.mechanics?.origin==='editor')return;
 const revision='utility-2014-1';if(sp.mechanics?.artificerUtilityRevision===revision&&sp.mechanics?.spell)return;
 const m={schemaVersion:GAME_MECHANICS_SCHEMA_VERSION,mode:'structured',origin:'explicit',activation:{cost:d.minute?'long':'action',ritual:!!sp.ritual},target:{kind:'none',base:1},components:inferComponents(sp),duration:{kind:d.rounds?'rounds':'instant',rounds:d.rounds,label:sp.d,concentration:d.concentration},resolution:normalizeResolutionContract({attack:null,save:null,contest:null,rolls:[],needsRoll:false},'spell'),effects:[],breakOn:[],special:'artificerUtility'};
 sp.conc=d.concentration;m.sourceHash=mechanicsSourceHash(sp,'spell');m.spell=compileSpellRule(sp,m);m.spell.input.requireCompleteRolls=false;m.spell.input.requireSceneFacts=false;m.spell.range.requiresMeasurement=false;m.spell.range.requiresLineOfSight=false;m.spell.range.requiresClearPath=false;m.spell.obstacles.requiresClearPath=false;
 // Legacy spells may have no grimoire record. A partial record without status
 // would silently archive them and invalidate their class lists and scrolls.
 m.artificerUtilityRevision=revision;sp.mechanics=m;
}
function artificerUtilityText(value,label){if(typeof value!=='string'||!value.trim()||value.trim().length>2000)throw Error('Заполните: '+label+' (до 2000 знаков).');return value.trim();}
function artificerUtilityNumber(value,min,max,label){if(!Number.isFinite(value)||value<min||value>max)throw Error('Проверьте '+label+': от '+min+' до '+max+'.');return value;}
function artificerUtilityAskText(label){const value=window.prompt(label,'');if(value==null)throw Error('cancelled');return artificerUtilityText(value,label);}
function artificerUtilityEntries(c){return (c?.activeFx||[]).filter(e=>e.artificerUtility&&(!Number.isFinite(e.expiresAtRound)||e.expiresAtRound>fxRound));}
function artificerUtilityInvestigation(key,input){
 const ti=targetInfoOf(key);if(!ti.obj)throw Error('Наблюдатель отсутствует.');const effects=ti.kind==='ally'?rollFxEntries(ti.obj,'skill.Расследование'):holderFxEntries(ti.obj).filter(f=>['skill.Расследование','check'].includes(f.stat));
 const adv=effects.some(f=>f.mode==='adv'),dis=effects.some(f=>f.mode==='dis')||(ti.obj.exhaustion||0)>=1,natural=input.natural||[],need=adv===dis?1:2;
 if(natural.length!==need||natural.some(n=>!Number.isInteger(n)||n<1||n>20))throw Error('Введите '+need+' реальных d20 проверки Расследования.');
 const raw=need===1?natural[0]:adv?Math.max(...natural):Math.min(...natural),base=ti.kind==='ally'?skillBonus(ti.obj,SKILLS.findIndex(s=>s[0]==='Расследование')).v:foeSkillMod(ti.obj,'Расследование','int');
 let total=(ti.kind==='ally'?abilityGameplayCheckNatural(ti.obj,'skill.Расследование',raw):raw)+base+effects.filter(f=>f.stat==='check'&&f.mode==='add').reduce((n,f)=>n+(+f.value||0),0),dice=effects.filter(f=>f.mode==='die');
 if((input.bonusDice||[]).length!==dice.length)throw Error('Введите все дополнительные кости проверки.');
 dice.forEach((f,i)=>{const m=String(f.value).match(/^(-)?(\d*)d(\d+)$/i);if(!m)throw Error('Неизвестная кость проверки.');const n=input.bonusDice[i],cnt=+m[2]||1,sides=+m[3];if(!Number.isInteger(n)||n<cnt||n>cnt*sides)throw Error('Проверьте дополнительную кость '+f.label);total+=n*(m[1]?-1:1);});
 return {total,holder:ti.obj,consume:[...new Set(effects.filter(f=>f.consume==='roll'&&f.sourceUid).map(f=>f.sourceUid))]};
}
function artificerUtilitySaveSpec(sp,caster,target){
 const rec=mechanicsClone(sp);rec.mechanics.resolution=normalizeResolutionContract({attack:null,save:{key:'dex',dc:{source:'spell'},half:false,tags:['magical']},contest:null,rolls:[],needsRoll:true},'spell');
 return structuredRollSpecOf(rec,{kind:'spell',caster,slotLvl:0,target:targetInfoOf(target)});
}
function artificerUtilityCollectInput(sp,targets,input){
 const d=artificerUtilityDefinition(sp);if(!d)return {ok:true,input};
 try{
  const c=getCh(castCtx?.casterId);if(!c)throw Error('Заклинатель не найден.');
  const selected=document.getElementById('castSlot')?.value,u=input.artificerUtility={key:d.key,scene:artificerUtilityAskText(d.range?'Предмет, место или получатель в сцене':'Место и описание эффекта'),distanceM:d.range?artificerSpellNumber('Дистанция, м',0,d.range):0,clearPath:artificerSpellBool('Препятствия не мешают именно этому заклинанию; его особые ограничения учтены')};
  if(!combat.active&&(d.minute||selected==='ritual'))u.minutesCompleted=artificerSpellBool('Непрерывное наложение '+((d.minute?1:0)+(selected==='ritual'?10:0))+' мин. завершено; условия и концентрация сохранялись');
  if(['light','mending','identify'].includes(d.key))u.touch=artificerSpellBool('Касание выбранной цели подтверждено');
  if(d.key==='light'){
   u.sizeM=artificerSpellNumber('Наибольший размер предмета, м',0,3.048);u.color=artificerUtilityAskText('Цвет света');u.covered=false;
   u.unwilling=artificerSpellBool('Предмет несёт или носит не желающее этого существо');
   if(u.unwilling){u.holderKey=artificerSpellChoose('Кто несёт предмет',chars.concat(foesDB).map(h=>({value:(chars.includes(h)?'ally:':'foe:')+h.id,label:h.name||h.n})));const sanctuary=artificerSanctuaryCollect(sp,[u.holderKey],input);if(!sanctuary.ok)return sanctuary;if(input.sanctuaryLost)return {ok:true,input};u.saveValues=artificerSpellReadValues(artificerUtilitySaveSpec(sp,c,u.holderKey));}
  }
  if(d.key==='dancingLights'){u.count=artificerSpellNumber('Число огоньков',1,4,true);u.connected=artificerSpellBool('Каждый огонёк не дальше 20 футов (6,096 м) от другого');u.shape=artificerUtilityAskText('Расположение огоньков или единая гуманоидная форма');}
  if(d.key==='message'){u.recipient=artificerUtilityAskText('Получатель');u.message=artificerUtilityAskText('Шепчемое сообщение');u.reply=artificerUtilityAskText('Ответ получателя, либо «без ответа»');u.targetKnown=artificerSpellBool('Получатель виден, либо знаком и его положение известно');u.barrierBlocked=artificerSpellBool('Путь блокируют магическая тишина, тонкий свинец, 30 см камня, 2,5 см металла или 90 см дерева/земли');}
  if(d.key==='prestidigitation'){
   u.mode=artificerSpellChoose('Малый эффект',[['sensory','Мгновенное безвредное ощущение'],['ignite','Зажечь свечу, факел или небольшой костёр'],['extinguish','Погасить свечу, факел или небольшой костёр'],['clean','Очистить'],['soil','Загрязнить'],['chill','Охладить'],['warm','Подогреть'],['flavor','Изменить вкус'],['mark','Цвет, отметка или символ'],['trinket','Немагическая безделушка / иллюзия на ладони']].map(([value,label])=>({value,label})));
   u.details=artificerUtilityAskText('Как именно изменяется сцена');if(['clean','soil','chill','warm','flavor'].includes(u.mode))u.cubicFeet=artificerSpellNumber('Объём в кубических футах (не более 1)',0,1);if(['ignite','extinguish','trinket'].includes(u.mode))u.legalSize=artificerSpellBool('Цель соответствует указанному малому размеру и не наносит урон');
  }
  if(d.key==='mageHand'){u.location=artificerUtilityAskText('Где появляется рука');u.carried=null;}
  if(d.key==='mending'){u.breakM=artificerSpellNumber('Длина одного разрыва/повреждения, м',0,0.3048);u.singleBreak=artificerSpellBool('Все части на месте, это один разрыв; восстановление магии не требуется');u.details=artificerUtilityAskText('Какой разрыв исправлен');}
  if(d.key==='detectMagic'){u.presence=artificerSpellBool('Мастер: в пределах 30 футов есть обнаружимая магия (с учётом препятствий и сокрытия)');u.details='Чувство присутствия магии; для аур используйте отдельное действие.';}
  if(d.key==='disguiseSelf'){u.heightDeltaM=artificerSpellNumber('Изменение роста, м (от −0,3048 до +0,3048)',-0.3048,0.3048);u.sameBody=artificerSpellBool('Расположение конечностей и строение тела сохранены');u.details=artificerUtilityAskText('Новая внешность, одежда и снаряжение (только видимость)');}
  if(d.key==='identify'){u.details=artificerUtilityAskText('Мастер: раскрытые свойства, использование, настройка, заряды и действующие заклинания; если нет — явно укажите «нет»');u.targetKind=artificerSpellChoose('Исследуемая цель',[{value:'item',label:'Предмет'},{value:'creature',label:'Существо: только действующие заклинания'}]);u.inventoryEntryId=artificerSpellChoose('Связать сведения с предметом сумки',[{value:'',label:'Цель сцены / существо'},...(c.inventory||[]).filter(e=>e.qty>0).map(e=>({value:e.id,label:itemOf(e.itemId)?.n||e.id}))]);}
  if(d.key==='purifyFoodDrink'){u.nonmagicalFood=artificerSpellBool('Это немагические пища и питьё');u.radiusM=artificerSpellNumber('Радиус выбранной области, м',0,1.524);u.details='Пища и питьё очищены от яда и болезней.';}
  if(d.key==='alarm'){u.areaSideM=artificerSpellNumber('Наибольшая сторона охраняемого куба, м',0,6.096);u.mode=artificerSpellChoose('Сигнал',[{value:'mental',label:'Мысленный — до 1 мили'}, {value:'audible',label:'Звон — слышен в 60 футах'}]);u.excluded=artificerUtilityAskText('Существа, которые не вызывают сигнал, через запятую; либо «нет»').split(',').map(x=>x.trim()).filter(x=>x&&x!=='нет');}
  return {ok:true,input};
 }catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Наложение отменено; ничего не потрачено.':error.message};}
}
function artificerUtilityPreflight(sp,caster,targets,level,rolls,byTarget,input,payment){
 const d=artificerUtilityDefinition(sp);if(!d)return {ok:true,handled:false};
 if(input?.sanctuaryLost)return {ok:true,handled:false};
 try{
  const u=input?.artificerUtility;if(!u||u.key!==d.key)throw Error('Сначала заполните условия и результат изменения сцены.');
  const a=mechanicsClone(u);a.scene=artificerUtilityText(a.scene,'цель или место');artificerUtilityNumber(a.distanceM,0,d.range,'расстояние');if(a.clearPath!==true)throw Error('Подтвердите допустимый путь до цели.');
  const time=(!combat.active?(d.minute?10:0)+(payment?.mode==='ritual'?100:0):0);
  if(d.minute&&combat.active){const check=arcanumLongCastPreflight(sp,caster,input);if(!check.ok)return check;}
  else if(time&&a.minutesCompleted!==true)throw Error('Нужно подтвердить непрерывное наложение и его время.');
  if(time){const check=recipeTabletopTimeCheck(time);if(!check.ok)return check;}
  if(['light','mending','identify'].includes(d.key)&&a.touch!==true)throw Error('Требуется касание цели.');
  let rounds=d.rounds,save=null;
  if(d.key==='light'){artificerUtilityNumber(a.sizeM,0,3.048,'размер предмета');a.color=artificerUtilityText(a.color,'цвет');if(typeof a.unwilling!=='boolean')throw Error('Укажите, согласен ли носитель предмета.');if(a.unwilling){if(!targetInfoOf(a.holderKey).obj)throw Error('Носитель предмета отсутствует.');save=artificerSpellResolved(artificerUtilitySaveSpec(sp,caster,a.holderKey),a.saveValues);}}
  if(d.key==='dancingLights'){if(!Number.isInteger(a.count)||a.count<1||a.count>4||a.connected!==true)throw Error('Нужны 1–4 огонька, каждый в 20 футах от другого.');a.shape=artificerUtilityText(a.shape,'расположение огоньков');}
  if(d.key==='message'){for(const field of ['recipient','message','reply'])a[field]=artificerUtilityText(a[field],field);if(a.targetKnown!==true||a.barrierBlocked!==false)throw Error('Получатель или допустимый путь сообщения не подтверждены.');}
  if(d.key==='prestidigitation'){
   if(!['sensory','ignite','extinguish','clean','soil','chill','warm','flavor','mark','trinket'].includes(a.mode))throw Error('Выберите допустимый малый эффект.');a.details=artificerUtilityText(a.details,'изменение сцены');
   if(['clean','soil','chill','warm','flavor'].includes(a.mode))artificerUtilityNumber(a.cubicFeet,0,1,'объём');if(['ignite','extinguish','trinket'].includes(a.mode)&&a.legalSize!==true)throw Error('Подтвердите малый безвредный эффект.');
   rounds=['chill','warm','flavor','mark'].includes(a.mode)?600:a.mode==='trinket'?2:0;
   if(rounds&&artificerUtilityEntries(caster).filter(e=>e.artificerUtility.key===d.key).length>=3)throw Error('Уже действуют три эффекта «Фокусов». Сначала завершите один действием.');
  }
  if(d.key==='mageHand')a.location=artificerUtilityText(a.location,'положение руки');
  if(d.key==='mending'){artificerUtilityNumber(a.breakM,0,0.3048,'разрыв');if(a.singleBreak!==true)throw Error('Можно исправить один разрыв до 1 фута, сохранив все части, без восстановления магии.');a.details=artificerUtilityText(a.details,'исправленный разрыв');}
  if(d.key==='detectMagic'&&typeof a.presence!=='boolean')throw Error('Мастер должен указать наличие обнаружимой магии.');
  if(d.key==='disguiseSelf'){artificerUtilityNumber(a.heightDeltaM,-0.3048,0.3048,'изменение роста');if(a.sameBody!==true)throw Error('Нельзя менять строение тела.');a.details=artificerUtilityText(a.details,'внешность');}
  if(d.key==='identify'){a.details=artificerUtilityText(a.details,'раскрытые свойства');if(!['item','creature'].includes(a.targetKind))throw Error('Выберите тип исследуемой цели.');if(a.inventoryEntryId&&(!invEntryOf(caster,a.inventoryEntryId)||a.targetKind!=='item'))throw Error('Исследуемый предмет больше недоступен.');}
  if(d.key==='purifyFoodDrink'){if(a.nonmagicalFood!==true)throw Error('Очищаются только немагические пища и питьё.');artificerUtilityNumber(a.radiusM,0,1.524,'радиус области');}
  if(d.key==='alarm'){artificerUtilityNumber(a.areaSideM,0,6.096,'область');if(!['mental','audible'].includes(a.mode)||!Array.isArray(a.excluded)||a.excluded.some(n=>typeof n!=='string'||n.length>100))throw Error('Укажите сигнал и исключённых существ.');}
  return {ok:true,handled:true,plan:{key:d.key,input:a,rounds,concentration:d.concentration,time,save,level}};
 }catch(error){return {ok:false,reason:error.message};}
}
function artificerUtilityRecord(c,record){c.artificerUtilityHistory=(c.artificerUtilityHistory||[]).concat({...record,round:fxRound}).slice(-100);}
function artificerUtilityRemove(c,entry){detachActiveFx(c,entry);c.activeFx=c.activeFx.filter(e=>e!==entry);}
function artificerUtilityToken(entry){return entry&&JSON.stringify([entry.uid,entry.castId,entry.casterId,entry.expiresAtRound,entry.combatUntilEndTurn,entry.artificerUtility]);}
function artificerUtilityCommitCast(enginePlan,sp,caster,castId){
 const p=enginePlan.artificerUtility.plan,a=p.input;
 if(p.time&&advanceFxRound(p.time)===false)throw Error('Сначала завершите последствия прошедшего времени.');
 if(['light','mageHand'].includes(p.key))for(const h of chars)for(const e of artificerUtilityEntries(h))if(e.casterId===caster.id&&e.artificerUtility.key===p.key)artificerUtilityRemove(h,e);
 if(p.save){consumeOutcomeRollFx(caster,a.holderKey,p.save);if(p.save.saveOk===true){artificerUtilityRecord(caster,{castId,key:p.key,scene:a.scene,result:'Носитель предмета успешно избежал света.'});castLogLine(sp.n+': успешный спасбросок носителя; свет не появился.');return;}}
 const description=p.key==='detectMagic'?(a.presence?'Обнаружено присутствие магии.':'Обнаружимая магия не найдена.'):p.key==='message'?a.recipient+': «'+a.message+'»; ответ: '+a.reply:p.key==='purifyFoodDrink'?'Пища и питьё очищены от яда и болезней.':a.details||a.location||a.shape||a.scene;
 if(p.rounds){const entry={k:'spell',id:sp.id,label:sp.n,from:caster.name,casterId:caster.id,castId,stackKey:'utility:'+castId,conc:p.concentration,fx:[{stat:'note',mode:'text',value:description}],durationKind:'rounds',expiresAtRound:fxRound+p.rounds,durationLabel:sp.d,artificerUtility:{...a,key:p.key,saveDc:spellDC(caster),revision:0}};
  if(p.key==='prestidigitation'&&a.mode==='trinket'&&combat.active){delete entry.expiresAtRound;entry.combatUntilEndTurn='ally:'+caster.id;entry.combatSkipMatchingEnd=combatCurrentKey()==='ally:'+caster.id;}
  applyFxTo(caster.id,entry);
 }
 if(p.key==='identify'&&a.inventoryEntryId){const e=invEntryOf(caster,a.inventoryEntryId);e.artificerIdentification={facts:a.details,castId,round:fxRound};}
 artificerUtilityRecord(caster,{castId,key:p.key,spell:sp.n,scene:a.scene,result:description});lastCastEvent={castId,casterId:caster.id,spellId:sp.id,usedSlotLvl:p.level,round:fxRound,targets:[],outcomeNotes:[description]};
 castLogLine(caster.name+': «'+sp.n+'», '+a.scene+' — '+description);recipeTabletopSpellTrigger(caster,sp);fxInvalidate();
}
function artificerUtilityAction(casterId,uid,action,input={}){
 const original=getCh(casterId),old=artificerUtilityEntries(original).find(e=>e.uid===uid),token=artificerUtilityToken(old),stamp=arcanumTurnStamp();
 const prepare=()=>{try{
  const c=getCh(casterId),entry=artificerUtilityEntries(c).find(e=>e.uid===uid);if(!c||!entry||artificerUtilityToken(entry)!==token||arcanumTurnStamp()!==stamp)throw Error('Эффект или ход изменился.');const a=entry.artificerUtility,key=a.key,data=mechanicsClone(input);
  if(arcanumSuppressed(c,entry))throw Error('Магия подавлена.');let cost='action',actorKey='ally:'+c.id,result='',inspection=null,remove=false,wakeOrdinary=false;
  if(action==='dismiss'){if(!['light','mageHand','prestidigitation','disguiseSelf','detectMagic','dancingLights'].includes(key))throw Error('У этого эффекта нет такого завершения.');if(entry.conc)cost='free';result='Эффект завершён.';}
  else if(action==='cover'&&key==='light'){if(typeof data.covered!=='boolean')throw Error('Укажите непрозрачное покрытие.');cost='object';result=data.covered?'Свет полностью закрыт непрозрачным предметом.':'Свет снова открыт: 20 футов яркого и ещё 20 футов тусклого света.';}
  else if(action==='move'&&key==='dancingLights'){cost='bonus';artificerUtilityNumber(data.moveM,0,18.288,'перемещение');artificerUtilityNumber(data.distanceM,0,36.576,'дистанцию от заклинателя');if(data.connected!==true)throw Error('Огоньки должны оставаться рядом: до 20 футов между соседними.');data.location=artificerUtilityText(data.location,'новое расположение');result='Огоньки перемещены: '+data.location;}
  else if(action==='hand'&&key==='mageHand'){artificerUtilityNumber(data.moveM,0,9.144,'перемещение руки');artificerUtilityNumber(data.distanceM,0,9.144,'дистанцию от заклинателя');artificerUtilityNumber(data.weightLb,0,10,'вес');if(data.legal!==true)throw Error('Рука не атакует, не активирует магические предметы и переносит не более 10 фунтов.');data.location=artificerUtilityText(data.location,'положение руки');data.details=artificerUtilityText(data.details,'манипуляция предметом');result=data.details+'; рука: '+data.location;}
  else if(action==='aura'&&key==='detectMagic'){artificerUtilityNumber(data.distanceM,0,9.144,'дистанцию');if(data.visible!==true||data.blocked!==false)throw Error('Для ауры цель должна быть видима и доступна обнаружению.');data.details=artificerUtilityText(data.details,'аура и школа, либо явно «магии нет»');result='Аура: '+data.details;}
  else if(action==='sense'&&key==='detectMagic'){cost='free';if(typeof data.presence!=='boolean')throw Error('Мастер должен указать обнаружимую магию.');result=data.presence?'В радиусе 30 футов обнаружена магия.':'Обнаружимой магии в радиусе 30 футов нет.';}
  else if(action==='range'&&['mageHand','dancingLights'].includes(key)){cost='free';artificerUtilityNumber(data.distanceM,0,100000,'дистанцию');remove=data.distanceM>(key==='mageHand'?9.144:36.576);result=remove?'Эффект исчез: превышена предельная дистанция.':'Эффект остаётся в пределах дистанции.';}
  else if(action==='inspect'&&key==='disguiseSelf'){cost='free';data.observer=artificerUtilityText(data.observer,'наблюдатель');if(data.physical===true)result=data.observer+': несоответствие обнаружено при физическом взаимодействии.';else{if(data.observerKey){inspection=artificerUtilityInvestigation(data.observerKey,data);data.investigationTotal=inspection.total;cost='action';actorKey=data.observerKey;}else{artificerUtilityNumber(data.investigationTotal,-20,100,'итог проверки Интеллекта (Расследование)');if(data.actionConfirmed!==true)throw Error('Наблюдатель должен потратить действие на осмотр.');}result=data.observer+(data.investigationTotal>=(a.saveDc||spellDC(c))?': распознал иллюзию.':': не распознал иллюзию.');}}
  else if(action==='alarm'&&key==='alarm'){cost='free';data.creature=artificerUtilityText(data.creature,'существо');if(data.tinyOrLarger!==true||data.entered!==true)throw Error('Нужно существо не меньше Крошечного, коснувшееся охраняемой области или вошедшее в неё.');artificerUtilityNumber(data.casterDistanceM,0,100000,'дистанцию до заклинателя');const excluded=a.excluded.includes(data.creature),mental=!excluded&&a.mode==='mental'&&data.casterDistanceM<=1609.344;
   wakeOrdinary=mental&&data.ordinarySleep===true&&c.hp>0&&normalizeConditions(c.cond).includes('Бессознательный')&&!(c.activeFx||[]).some(e=>(e.fx||[]).some(f=>f.stat==='condition'&&canonicalCondition(f.value)==='Бессознательный'));
   result=excluded?'Существо исключено: сигнал не прозвучал.':a.mode==='mental'?(mental?'Мысленный сигнал получен.'+(wakeOrdinary?' Обычный сон заклинателя прерван.':''):'Заклинатель дальше мили: мысленный сигнал не получен.'):'Звон слышен в 60 футах в течение 10 секунд.';}
  else throw Error('Это действие не подходит к эффекту.');
  const actor=targetInfoOf(actorKey);if(cost!=='free'&&(!actor.obj||actor.obj.hp<=0||ACTION_BLOCK_CONDS.some(n=>(actor.kind==='foe'?effectiveFoeConditions(actor.obj):effectiveConditions(actor.obj)).includes(n))))throw Error('Состояние не позволяет действовать.');if(combat.active&&cost!=='free'&&!combatCanSpendPure(cost,actorKey))throw Error('Нужен свободный ресурс своего хода.');
  return {ok:true,c,entry,data,cost,actorKey,result,inspection,remove,wakeOrdinary};
 }catch(error){return {ok:false,reason:error.message};}};
 return arcanumAction('utility:'+uid+':'+action,prepare,p=>{if(combat.active&&p.cost!=='free'&&!combatSpend(p.cost,p.entry.label,p.actorKey))throw Error('Действие уже недоступно.');
  if(p.inspection)consumeRollFx(p.inspection.holder,p.inspection.consume);
  if(p.wakeOrdinary)p.c.cond=normalizeConditions(p.c.cond).filter(n=>n!=='Бессознательный');
  if(action==='dismiss'||p.remove)artificerUtilityRemove(p.c,p.entry);else{p.entry.artificerUtility={...p.entry.artificerUtility,...p.data,revision:p.entry.artificerUtility.revision+1};p.entry.fx=[{stat:'note',mode:'text',value:p.result}];}
  artificerUtilityRecord(p.c,{key:p.entry.artificerUtility.key,scene:p.entry.artificerUtility.scene,result:p.result});castLogLine(p.entry.label+': '+p.result);fxInvalidate();
 });
}
function artificerUtilityActionOpen(casterId,uid,action){
 try{const input={};
  if(action==='cover')input.covered=artificerSpellBool('Свет полностью закрыт непрозрачным предметом');
  if(action==='move'||action==='hand'){input.moveM=artificerSpellNumber('Расстояние перемещения, м');input.distanceM=artificerSpellNumber('Итоговая дистанция от заклинателя, м');input.location=artificerUtilityAskText('Новое положение');if(action==='move')input.connected=artificerSpellBool('Каждый огонёк в 20 футах от другого');else{input.weightLb=artificerSpellNumber('Вес переносимого предмета, фунтов');input.legal=artificerSpellBool('Рука не атакует, не активирует магический предмет; взаимодействие возможно');input.details=artificerUtilityAskText('Какая манипуляция выполнена');}}
  if(action==='aura'){input.distanceM=artificerSpellNumber('Дистанция до исследуемой ауры, м');input.visible=artificerSpellBool('Цель видима');input.blocked=artificerSpellBool('Магию закрывают 30 см камня, 2,5 см металла, свинец или 90 см дерева/земли, либо особая защита');input.details=artificerUtilityAskText('Мастер: аура и школа магии, либо «магии нет»');}
  if(action==='sense')input.presence=artificerSpellBool('Мастер: в 30 футах есть обнаружимая магия с учётом препятствий и сокрытия');
  if(action==='range')input.distanceM=artificerSpellNumber('Текущая дистанция до заклинателя, м');
  if(action==='inspect'){input.observerKey=artificerSpellChoose('Кто проверяет маскировку',[{value:'',label:'Участник сцены без игрового листа'},...chars.concat(foesDB).map(h=>({value:(chars.includes(h)?'ally:':'foe:')+h.id,label:h.name||h.n}))]);input.observer=input.observerKey?targetInfoOf(input.observerKey).name:artificerUtilityAskText('Имя наблюдателя');input.physical=artificerSpellBool('Есть физическое взаимодействие, обнаруживающее несоответствие');if(!input.physical){if(input.observerKey){const ti=targetInfoOf(input.observerKey),effects=ti.kind==='ally'?rollFxEntries(ti.obj,'skill.Расследование'):holderFxEntries(ti.obj).filter(f=>['skill.Расследование','check'].includes(f.stat)),adv=effects.some(f=>f.mode==='adv'),dis=effects.some(f=>f.mode==='dis')||(ti.obj.exhaustion||0)>=1;input.natural=[artificerSpellNumber('Расследование: d20',1,20,true)];if(adv!==dis)input.natural.push(artificerSpellNumber('Второй d20: '+(adv?'преимущество':'помеха'),1,20,true));input.bonusDice=effects.filter(f=>f.mode==='die').map(f=>artificerSpellNumber(f.label+': сумма '+f.value,0,10000,true));}else{input.actionConfirmed=artificerSpellBool('Наблюдатель потратил действие');input.investigationTotal=artificerSpellNumber('Итог проверки Интеллекта (Расследование), включая модификатор',-20,100);}}}
  if(action==='alarm'){input.creature=artificerUtilityAskText('Какое существо пересекло область');input.tinyOrLarger=artificerSpellBool('Размер не меньше Крошечного');input.entered=artificerSpellBool('Существо вошло в область или коснулось её');input.casterDistanceM=artificerSpellNumber('Дистанция до заклинателя, м');const c=getCh(casterId);if(c?.hp>0&&normalizeConditions(c.cond).includes('Бессознательный'))input.ordinarySleep=artificerSpellBool('Мастер: заклинатель спит обычным сном, без магического усыпления, яда или другой причины потери сознания');}
  return artificerUtilityAction(casterId,uid,action,input);
 }catch(error){setStatus(error.message==='cancelled'?'Действие отменено; ресурсы сохранены.':error.message,true);return false;}
}
function artificerUtilityControls(c){
 const entries=artificerUtilityEntries(c),history=c.artificerUtilityHistory||[];if(!entries.length&&!history.length)return '';
 const button=(e,action,label)=>'<button class="btn ghost sm" onclick="'+esc('artificerUtilityActionOpen('+JSON.stringify(c.id)+','+JSON.stringify(e.uid)+','+JSON.stringify(action)+')')+'">'+esc(label)+'</button>';
 let html='<section class="panel"><h3>Магия в сцене</h3>';
 for(const e of entries){const a=e.artificerUtility;html+='<p><b>'+esc(e.label)+'</b> · '+esc(a.scene)+' · '+(Number.isFinite(e.expiresAtRound)?Math.max(0,(e.expiresAtRound-fxRound)*6)+' сек.':'до конца следующего хода')+(e.conc?' · концентрация':'')+'<br>'+esc((e.fx||[]).find(f=>f.stat==='note')?.value||'');
  if(a.key==='light')html+='<br>Свет: '+(a.covered?'закрыт':'6,096 м яркий + 6,096 м тусклый')+' · '+esc(a.color)+' '+button(e,'cover','Закрыть / открыть');
  if(a.key==='dancingLights')html+='<br>'+a.count+' огонька, каждый освещает 3,048 м тусклым светом. '+button(e,'move','Переместить — бонусное действие');
  if(a.key==='mageHand')html+=' '+button(e,'hand','Управлять рукой — действие');
  if(['mageHand','dancingLights'].includes(a.key))html+=' '+button(e,'range','Проверить дистанцию');
  if(a.key==='detectMagic')html+=' '+button(e,'sense','Обновить ощущение магии')+' '+button(e,'aura','Изучить ауру — действие');
  if(a.key==='disguiseSelf')html+=' '+button(e,'inspect','Проверить маскировку');
  if(a.key==='alarm')html+=' '+button(e,'alarm','Существо пересекло область');
  else html+=' '+button(e,'dismiss',e.conc?'Прекратить концентрацию':'Завершить — действие');
  html+='</p>';
 }
 if(history.length)html+='<details><summary>Последние изменения сцены</summary>'+history.slice(-10).reverse().map(r=>'<p>'+esc(r.scene)+': '+esc(r.result)+'</p>').join('')+'</details>';
 return html+'</section>';
}

(function(root,factory){
'use strict';
const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.DND_ARCANUM_CORE=api;
})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
// SRD 5.1 / 2014, not the different damage dice in the 2024 Circle of Death.
// https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spells
const revision='srd2014-arcanum-core-1',feet=value=>value*0.3048;
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=reason=>({ok:false,reason});
const number=value=>typeof value==='number'&&Number.isFinite(value);
function buildMechanics(special,base){
  if(!['circleOfDeath','trueSeeing'].includes(special))return null;
  const m=clone(base||{}),circle=special==='circleOfDeath';
  Object.assign(m,{mode:'structured',origin:'explicit',special,manualNote:'',breakOn:[],
    activation:{cost:'action',ritual:false},target:circle?{kind:'any',base:1,allCreatures:true,area:true}:{kind:'any',base:1},
    duration:circle?{kind:'instant',rounds:0,label:'Мгновенная',concentration:false}:{kind:'rounds',rounds:600,label:'1 час',concentration:false},
    components:{verbal:true,somatic:true,material:circle?
      {description:'порошок чёрного жемчуга стоимостью не менее 500 зм',matchTokens:['жемчу'],form:'powder',cost:500,costMode:'aggregate',consume:0}:
      {description:'мазь для глаз из грибного порошка, шафрана и жира стоимостью 25 зм',matchTokens:['мазь'],form:'ointment',cost:25,costMode:'single',consume:1}},
    resolution:{attack:null,save:circle?{key:'con',dc:{source:'spell'},half:true,tags:['magical']}:null,contest:null,
      rolls:circle?[{type:'dmg',cnt:8,sides:6,mod:{source:'fixed',value:0},damageType:'некротическая энергия',upcast:{fromSlot:6,perSlot:2}}]:[],needsRoll:circle},
    effects:circle?[]:[{stat:'vision.true',mode:'min',value:feet(120),note:'Истинное зрение: 120 футов'},
      {stat:'vision.secretDoors',mode:'min',value:feet(120),note:'Секретные двери, скрытые магией'},
      {stat:'vision.ethereal',mode:'min',value:feet(120),note:'Зрение в Эфирный план'}]});
  // A caller may compile its standard full spell rule first and then apply these
  // projections; no source record, target, inventory or resource is mutated here.
  if(m.spell)m.spell=projectRule(special,m.spell,m);
  return m;
}
function projectRule(special,base,mechanics){
  if(!['circleOfDeath','trueSeeing'].includes(special))return clone(base||{});
  const m=mechanics||buildMechanics(special),rule=clone(base||{}),circle=special==='circleOfDeath';
  Object.assign(rule,{level:6,castingTime:{label:'1 действие',cost:'action'},components:clone(m.components),materialComponents:[clone(m.components.material)],
    duration:clone(m.duration),concentration:false,ritual:false,
    range:circle?{label:'150 футов до центра сферы',kind:'distance',distanceM:feet(150),requiresMeasurement:false,requiresLineOfSight:false,requiresClearPath:false}:
      {label:'Касание',kind:'touch',distanceM:1.5,requiresMeasurement:false,requiresLineOfSight:false,requiresClearPath:false},
    targeting:{type:'any',count:{base:1,perSlot:0,fromSlot:6,allCreatures:circle},area:circle?{shape:'sphere',sizeM:feet(60),radiusM:feet(60),origin:'chosenPoint',affects:'allCreatures'}:null},
    resolution:{attack:null,savingThrow:clone(m.resolution.save),damage:clone(m.resolution.rolls),healing:[],scaling:circle?[{type:'dmg',levelTiers:[],upcast:{fromSlot:6,perSlot:2}}]:[]},
    conditions:[],defenses:{applyDamageTraits:true,applyConditionImmunities:true,resistances:true,immunities:true},
    input:{...(rule.input||{}),requireCompleteRolls:circle},
    termination:{...(rule.termination||{}),dispel:!circle,concentration:false,antimagicSuppresses:true,triggers:[]}});
  return rule;
}
function circleDiceCount(slot=6){return Number.isInteger(slot)&&slot>=6&&slot<=9?8+2*(slot-6):null;}
// Every target has its own resolved save and defenses. Only the physical damage
// roll is shared. resolveDamage, when provided, recomputes current defenses in
// the owning engine, avoiding a parallel resistance/immunity implementation.
function validateCircleDamage(carriers,slot=6,resolveDamage){
  const count=circleDiceCount(slot);
  if(count==null)return fail('Для «Круга смерти» нужен круг от 6 до 9.');
  if(!Array.isArray(carriers)||!carriers.length)return fail('Выберите существ в области «Круга смерти».');
  const raw=carriers[0]?.dmgRaw;
  if(!Number.isSafeInteger(raw)||raw<count||raw>count*6)return fail('Нужна общая сумма '+count+'d6, брошенных игроками.');
  for(let index=0;index<carriers.length;index++){
    const row=carriers[index];
    if(!row||row.saveMade!==true||typeof row.saveOk!=='boolean')return fail('Для каждого существа нужен отдельный результат спасброска Телосложения.');
    if(row.dmgRaw!==raw)return fail('Все существа в области используют одну общую сумму '+count+'d6.');
    if(!Number.isSafeInteger(row.dmgTotal)||row.dmgTotal<0)return fail('Урон каждой цели должен быть рассчитан с её защитой.');
    if(typeof resolveDamage==='function'){
      const saved=row.saveOk?Math.floor(raw/2):raw,expected=resolveDamage(saved,index,row);
      if(!Number.isSafeInteger(expected)||expected<0||row.dmgTotal!==expected)return fail('Спасбросок или защита цели изменились. Пересчитайте последствия «Круга смерти».');
    }
  }
  return {ok:true,raw,count,sides:6,damageType:'некротическая энергия'};
}
function validateTrueSeeingInput(input){
  if(input?.willing!==true)return fail('Подтвердите согласие существа на «Истинное зрение».');
  if(!number(input.distanceM)||input.distanceM<0||input.distanceM>1.5)return fail('Для «Истинного зрения» нужно подтвердить касание цели (до 1,5 м).');
  return {ok:true};
}
function validateCircleArea(input,targets){
  if(!number(input?.centerDistanceM)||input.centerDistanceM<0||input.centerDistanceM>feet(150)+1e-9)return fail('Укажите центр «Круга смерти» в пределах 150 футов (45,72 м).');
  if(input.clearPath!==true)return fail('Подтвердите свободный путь до центра области.');
  if(input.allCreaturesIncluded!==true)return fail('Включите всех существ в сфере радиусом 60 футов (18,288 м), включая союзников.');
  if(!Array.isArray(targets)||!targets.length||new Set(targets).size!==targets.length)return fail('Укажите неповторяющихся существ в области.');
  for(const target of targets){
    const facts=input.byTarget?.[target];
    if(!number(facts?.distanceFromCenterM)||facts.distanceFromCenterM<0||facts.distanceFromCenterM>feet(60)+1e-9)return fail('Подтвердите расстояние от центра до цели '+target+' (не более 60 футов).');
    if(facts.totalCover!==false)return fail('Подтвердите отсутствие полного укрытия от центра области для '+target+'.');
  }
  return {ok:true};
}
// Pass only currently active, unsuppressed effects. Unknown distance cannot
// confer unlimited sight; the caller requests the measurement when relevant.
function visionCapabilities(effects,distanceM,conditions=[]){
  const rows=Array.isArray(effects)?effects:[],range=stat=>Math.max(0,...rows.filter(row=>row?.stat===stat&&number(row.value)&&row.value>0).map(row=>row.value));
  const trueRangeM=range('vision.true'),blind=conditions.some(value=>/^(?:ослепленны[йя]|blinded)$/i.test(String(value).replace(/ё/g,'е')));
  const measured=number(distanceM)&&distanceM>=0,within=limit=>!blind&&measured&&limit>0&&distanceM<=limit+1e-9;
  const truesight=within(trueRangeM);
  return {trueRangeM,requiresDistance:!blind&&!measured&&trueRangeM>0,truesight,
    seeInvisible:truesight,seeDarkness:truesight,recognizeVisualIllusions:truesight,seeOriginalForm:truesight,
    seeEthereal:within(Math.max(trueRangeM,range('vision.ethereal'))),noticeMagicalSecretDoors:within(range('vision.secretDoors'))};
}
return Object.freeze({revision,buildMechanics,projectRule,circleDiceCount,validateCircleDamage,validateCircleArea,validateTrueSeeingInput,visionCapabilities});
});

(function(root){
'use strict';
// Tasha's Cauldron of Everything (2020), pp. 9–23; 2014 rules, not the 2025 revision.
// These plans are pure. The caller checks current world state, commits once and
// applies the returned consequences. No dice, time, inventory or saves are changed here.
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=reason=>({ok:false,reason});
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const levelOf=c=>c?.cls==='Изобретатель'&&integer(c.level,1,20)?c.level:0;
const intMod=c=>Math.floor(((integer(c?.ab?.int,1,30)?c.ab.int:10)-10)/2);
const sources=freeze([
  {title:'Artificer 101: Alchemist (2020)',url:'https://www.dndbeyond.com/posts/908-artificer-101-alchemist-from-tashas-cauldron-of'},
  {title:'Artificer 101 (2020)',url:'https://www.dndbeyond.com/posts/854-artificer-101-a-beginners-guide-to-making-magical'},
  {title:'Artificer 201: Infusions (2022)',url:'https://www.dndbeyond.com/posts/1353-artificer-201-the-best-infusions-for-artificers'}
]);
const slotTable=freeze([[],[2],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]]);
const artisanTools=freeze(['Инструменты алхимика','Инструменты пивовара','Инструменты каллиграфа','Инструменты плотника','Инструменты картографа','Инструменты сапожника','Инструменты повара','Инструменты стеклодува','Инструменты ювелира','Инструменты кожевника','Инструменты каменщика','Инструменты художника','Инструменты гончара','Инструменты кузнеца','Инструменты жестянщика','Инструменты ткача','Инструменты резчика по дереву']);
const alchemistSpells=freeze([
  {level:3,spells:['Healing Word','Ray of Sickness']},
  {level:5,spells:['Flaming Sphere','Acid Arrow']},
  {level:9,spells:['Gaseous Form','Mass Healing Word']},
  {level:13,spells:['Blight','Death Ward']},
  {level:17,spells:['Cloudkill','Raise Dead']}
]);
function slots(level){return integer(level,1,20)?slotTable[level].slice():[];}
function cantrips(level){return !integer(level,1,20)?0:level>=14?4:level>=10?3:2;}
function preparedLimit(c){return levelOf(c)?Math.max(1,intMod(c)+Math.floor(c.level/2)):0;}
function alwaysPrepared(c){return levelOf(c)&&c.subcls==='Алхимик'?alchemistSpells.filter(r=>r.level<=c.level).flatMap(r=>r.spells):[];}
function profile(c){
  const level=levelOf(c);if(!level)return null;
  const alchemist=c.subcls==='Алхимик'&&level>=3;
  return {edition:'2014',source:'TCoE 2020',level,alchemist,ability:'int',intelligenceModifier:intMod(c),hitDie:8,
    slots:slots(level),maxCircle:slots(level).length,cantrips:cantrips(level),preparedLimit:preparedLimit(c),alwaysPrepared:alwaysPrepared(c),
    preparation:'prepared',ritualCasting:true,ritualRequiresPrepared:true,requiresToolFocus:true,infusedFocus:level>=2,
    infusionsKnown:level<2?0:level>=18?12:level>=14?10:level>=10?8:level>=6?6:4,
    infusedItems:level<2?0:level>=18?6:level>=14?5:level>=10?4:level>=6?3:2,
    tinkeringLimit:Math.max(1,intMod(c)),rightTool:level>=3,toolExpertise:level>=6,
    freeElixirs:!alchemist?0:level>=15?3:level>=6?2:1,alchemicalSavant:alchemist&&level>=5,
    restorativeReagents:alchemist&&level>=9,chemicalMastery:alchemist&&level>=15,
    attunementLimit:level>=18?6:level>=14?5:level>=10?4:3};
}
const elixirs=freeze([
  {roll:1,id:'healing',name:'Исцеление',durationSeconds:0,healingDice:{count:2,sides:4},addIntelligence:true},
  {roll:2,id:'swiftness',name:'Быстрота',durationSeconds:3600,effects:{walkingSpeedBonus:3}},
  {roll:3,id:'resilience',name:'Устойчивость',durationSeconds:600,effects:{armorClassBonus:1}},
  {roll:4,id:'boldness',name:'Смелость',durationSeconds:60,effects:{attackBonusDice:'1d4',savingThrowBonusDice:'1d4'}},
  {roll:5,id:'flight',name:'Полёт',durationSeconds:600,effects:{flyingSpeed:3}},
  {roll:6,id:'transformation',name:'Преображение',durationSeconds:600,effects:{alterSelf:true}}
]);
function elixirDefinition(value){return elixirs.find(e=>e.id===value||e.roll===value)||null;}
// request: source:'rest'|'slot', hasSupplies, emptyFlasks; restAvailable + rolls,
// or kind + slotLevel + availableSlots. Rest entitlement is supplied by the ledger.
function elixirPlan(c,request={}){
  const p=profile(c);if(!p?.alchemist)return fail('Экспериментальные эликсиры доступны алхимику с 3 уровня.');
  if(request.hasSupplies!==true)return fail('Нужны инструменты алхимика при себе.');
  let kinds,slotLevel=0;
  if(request.source==='rest'){
    if(!integer(request.restAvailable,1,p.freeElixirs))return fail('После этого долгого отдыха доступных эликсиров не осталось.');
    if(!Array.isArray(request.rolls)||!request.rolls.length||request.rolls.length>request.restAvailable||request.rolls.some(n=>!integer(n,1,6)))return fail('Введите по одному результату к6 от 1 до 6 для каждого эликсира.');
    kinds=request.rolls.map(elixirDefinition);
  }else if(request.source==='slot'){
    slotLevel=request.slotLevel;
    if(!integer(slotLevel,1,p.maxCircle)||!integer(request.availableSlots,1,99))return fail('Нужна доступная ячейка открытого круга.');
    const kind=elixirDefinition(request.kind);if(!kind)return fail('Выберите один из шести эликсиров.');kinds=[kind];
  }else return fail('Неизвестный способ создания эликсира.');
  if(!integer(request.emptyFlasks,kinds.length,9999))return fail('Для каждого эликсира нужен отдельный пустой флакон.');
  return {ok:true,cost:{action:request.source==='slot'?1:0,slotLevel,slots:slotLevel?1:0,flasks:kinds.length,restUses:slotLevel?0:kinds.length},
    elixirs:kinds.map(e=>({kind:e.id,roll:e.roll,name:e.name,creatorId:c.id||'',creatorLevel:c.level,intelligenceModifier:p.intelligenceModifier,expires:'creator-next-long-rest',source:request.source})),
    timing:request.source==='rest'?'long-rest-completion':'action'};
}
function diceTotal(dice,count,sides){return Array.isArray(dice)&&dice.length===count&&dice.every(v=>integer(v,1,sides))?dice.reduce((a,b)=>a+b,0):null;}
// Self-drinking or administering to an unconscious creature takes an action.
// Dice are entered individually. Repeated 1d4 bonuses are requested at each roll,
// never fixed at drinking time. Elixirs do not require concentration.
function elixirUsePlan(c,elixir,request={}){
  const p=profile(c),definition=elixirDefinition(elixir?.kind);if(!p?.alchemist||!definition||elixir.creatorId!==c.id)return fail('Создатель или вид эликсира не найден.');
  if(elixir.consumed===true||elixir.expired===true)return fail('Этот эликсир уже использован или истёк.');
  if(request.self!==true&&request.targetUnconscious!==true)return fail('Союзник в сознании должен сам выпить эликсир своим действием.');
  if(request.self!==true&&request.withinTouch!==true)return fail('Чтобы напоить бессознательную цель, нужно находиться рядом.');
  const result={ok:true,kind:definition.id,name:definition.name,cost:{action:1,elixirs:1},durationSeconds:definition.durationSeconds,concentration:false,effects:clone(definition.effects||{}),healing:0,tempHp:0,stackKey:'artificer-elixir:'+definition.id};
  if(definition.id==='healing'){
    const total=diceTotal(request.healingDice,2,4);if(total===null)return fail('Введите два результата к4 для лечения.');result.healing=Math.max(0,total+p.intelligenceModifier);
  }
  if(definition.id==='transformation'){
    if(!['aquatic','appearance','natural-weapons'].includes(request.transformationChoice))return fail('Выберите водную адаптацию, внешность или природное оружие.');
    result.effects={alterSelf:request.transformationChoice};
    if(request.transformationChoice==='aquatic')Object.assign(result.effects,{waterBreathing:true,swimmingSpeedEqualsWalking:true});
    if(request.transformationChoice==='natural-weapons'){
      if(!['bludgeoning','piercing','slashing'].includes(request.naturalWeaponDamage))return fail('Выберите дробящий, колющий или рубящий урон природного оружия.');
      Object.assign(result.effects,{naturalWeapon:{dice:'1d6',ability:'str',damageType:request.naturalWeaponDamage,attackBonus:1,damageBonus:1,magical:true,proficient:true}});
    }
  }
  if(p.restorativeReagents){const total=diceTotal(request.tempHpDice,2,6);if(total===null)return fail('Введите два результата к6 временных хитов от восстанавливающих реагентов.');result.tempHp=Math.max(0,total+p.intelligenceModifier);}
  return result;
}
const infusionCatalog=freeze([
  {id:'enhanced-defense',name:'Усиленная защита',level:2,kinds:['armor','shield'],attunement:false,effects:{armorClassBonus:1},upgradeAt:10},
  {id:'enhanced-weapon',name:'Усиленное оружие',level:2,kinds:['weapon'],attunement:false,effects:{attackBonus:1,damageBonus:1,magicalWeapon:true},upgradeAt:10},
  {id:'enhanced-arcane-focus',name:'Усиленная магическая фокусировка',level:2,kinds:['rod','staff','wand'],attunement:true,effects:{spellAttackBonus:1,ignoreHalfCover:true},upgradeAt:10},
  {id:'repeating-shot',name:'Повторяющийся выстрел',level:2,kinds:['weapon'],property:'ammunition',attunement:true,effects:{attackBonus:1,damageBonus:1,magicalWeapon:true,ignoreLoading:true,createsAmmunition:true}},
  {id:'returning-weapon',name:'Возвращающееся оружие',level:2,kinds:['weapon'],property:'thrown',attunement:false,effects:{attackBonus:1,damageBonus:1,magicalWeapon:true,returnsAfterRangedAttack:true}},
  {id:'mind-sharpener',name:'Обостритель разума',level:2,kinds:['armor','robe'],attunement:false,effects:{charges:4,restoreAtDawn:'1d4',concentrationSaveSuccessReaction:true}},
  {id:'homunculus-servant',name:'Гомункул-слуга',level:2,kinds:['gem','crystal'],minimumValueGp:100,attunement:false,effects:{companion:'homunculus-servant'}},
  ...[['alchemy-jug','Алхимический сосуд'],['bag-of-holding','Сумка хранения'],['cap-of-water-breathing','Шапка подводного дыхания'],['goggles-of-night','Очки ночного зрения'],['rope-of-climbing','Верёвка лазания'],['sending-stones','Камни послания'],['wand-of-magic-detection','Палочка обнаружения магии'],['wand-of-secrets','Палочка секретов']].map(([item,name])=>({id:'replicate:'+item,name:'Копия: '+name,level:2,kinds:['mundane'],attunement:false,effects:{replicateItem:item}})),
  {id:'boots-of-the-winding-path',name:'Сапоги извилистой тропы',level:6,kinds:['boots'],attunement:true,effects:{teleportToVisitedSpace:4.5,action:'bonus'}},
  {id:'radiant-weapon',name:'Сияющее оружие',level:6,kinds:['weapon'],attunement:true,effects:{attackBonus:1,damageBonus:1,magicalWeapon:true,charges:4,restoreAtDawn:'1d4',lightBright:9,lightDim:9,blindingReactionSave:'con'}},
  {id:'repulsion-shield',name:'Отталкивающий щит',level:6,kinds:['shield'],attunement:true,effects:{armorClassBonus:1,charges:4,restoreAtDawn:'1d4',pushReaction:4.5}},
  {id:'spell-refueling-ring',name:'Кольцо восполнения заклинаний',level:6,kinds:['ring'],attunement:true,effects:{restoreSlotMaxCircle:3,restoreUses:1,recovery:'dawn',action:'action'}},
  {id:'helm-of-awareness',name:'Шлем бдительности',level:10,kinds:['helmet'],attunement:true,effects:{initiativeAdvantage:true,noSurpriseUnlessIncapacitated:true}},
  {id:'arcane-propulsion-armor',name:'Броня магического движения',level:14,kinds:['armor'],attunement:true,effects:{walkingSpeedBonus:1.5,gauntletDice:'1d8',gauntletDamageType:'force',gauntletThrownRange:[6,18],gauntletReturns:true}}
]);
function infusionDefinition(id,level){const row=infusionCatalog.find(r=>r.id===id);if(!row||!integer(level,1,20)||level<row.level)return null;const result=clone(row);if(row.upgradeAt&&level>=row.upgradeAt)for(const key of ['armorClassBonus','attackBonus','damageBonus','spellAttackBonus'])if(result.effects[key])result.effects[key]=2;return result;}
function knownInfusionsPlan(c,knownIds,context={}){
  const p=profile(c);if(!p||!p.infusionsKnown)return fail('Инфузии доступны изобретателю со 2 уровня.');
  if(!Array.isArray(knownIds)||knownIds.length>p.infusionsKnown||new Set(knownIds).size!==knownIds.length||knownIds.some(id=>!infusionDefinition(id,c.level)))return fail('Проверьте число, уникальность и уровни известных инфузий.');
  const previous=context.previous||[];
  if(!Array.isArray(previous)||previous.some(id=>typeof id!=='string'))return fail('Повреждён прежний список инфузий.');
  const removed=previous.filter(id=>!knownIds.includes(id));
  if(removed.length&&(context.levelGained!==true||removed.length>1))return fail('Одну известную инфузию можно заменить только при повышении уровня.');
  return {ok:true,known:knownIds.slice(),removed};
}
// selections contain {infusionId,itemId}; items are normalized physical objects
// {id,kind,magic,weaponCategory,properties,valueGp}. Existing infusions must first
// be projected onto their mundane bases by the caller; an item has one infusion.
function infusionPlan(c,knownIds,selections,context={}){
  const p=profile(c),known=knownInfusionsPlan(c,knownIds);if(!known.ok)return known;
  if(context.longRestCompleted!==true)return fail('Предметы насыщаются инфузиями после долгого отдыха.');
  if(!Array.isArray(selections)||selections.length>p.infusedItems)return fail('Превышено число одновременно насыщенных предметов.');
  if(!Array.isArray(context.items))return fail('Предметы для инфузий не найдены.');
  const ids=new Set(),objects=new Set(),active=[];
  for(const selection of selections){
    const row=infusionDefinition(selection?.infusionId,c.level),item=context.items.find(i=>i.id===selection?.itemId);
    if(!row||!knownIds.includes(row.id)||ids.has(row.id))return fail('Каждую известную инфузию можно применить только к одному предмету.');
    if(!item||typeof item.id!=='string'||objects.has(item.id)||item.magic!==false)return fail('Нужен отдельный немагический предмет для каждой инфузии.');
    if(!row.kinds.includes(item.kind)||row.property&&!(item.properties||[]).includes(row.property)||row.minimumValueGp&&!(item.valueGp>=row.minimumValueGp))return fail('Этот предмет не подходит для выбранной инфузии.');
    if(item.kind==='weapon'&&!['simple','martial'].includes(item.weaponCategory))return fail('Нужен тип простого или воинского оружия.');
    ids.add(row.id);objects.add(item.id);active.push({infusionId:row.id,itemId:item.id,creatorId:c.id||'',name:row.name,attunement:row.attunement,effects:row.effects,spellcastingFocus:true});
  }
  return {ok:true,active,cost:{action:0},expiresAfterCreatorDeathDays:Math.max(1,p.intelligenceModifier)};
}
const tinkeringKinds=freeze(['light','message','sensory','image']);
function tinkeringPlan(c,request={},active=[]){
  const p=profile(c);if(!p)return fail('Магическое мастерство доступно изобретателю с 1 уровня.');
  if(request.hasToolsInHand!==true)return fail('Держите в руке воровские или ремесленные инструменты.');
  if(typeof request.itemId!=='string'||!request.itemId||request.tiny!==true||request.nonmagical!==true)return fail('Нужен крошечный немагический предмет в пределах касания.');
  if(!tinkeringKinds.includes(request.kind)||!Array.isArray(active))return fail('Выберите свойство магического мастерства.');
  if(active.some(r=>r.itemId===request.itemId))return fail('На предмете уже есть свойство магического мастерства.');
  const text=typeof request.text==='string'?request.text.trim():'';
  if(request.kind!=='light'&&(!text||text.length>1000))return fail('Кратко опишите записанное сообщение, звук, запах или изображение.');
  if(request.kind==='message'&&(!Number.isFinite(request.seconds)||request.seconds<=0||request.seconds>6))return fail('Запись должна длиться не более 6 секунд.');
  if(request.kind==='image'&&text.split(/\s+/u).length>25)return fail('Надпись на предмете содержит не более 25 слов.');
  const item={itemId:request.itemId,kind:request.kind,text,creatorId:c.id||'',effects:request.kind==='light'?{brightLight:1.5,dimLight:1.5}:request.kind==='message'?{messageSeconds:request.seconds,audibleRange:3,trigger:'touch'}:request.kind==='sensory'?{perceptibleRange:3}:{staticImage:true}};
  const next=clone(active).concat(item),removed=next.splice(0,Math.max(0,next.length-p.tinkeringLimit));
  return {ok:true,active:next,removed,cost:{action:1},duration:'until-dismissed'};
}
function rightToolPlan(c,request={}){
  if(!profile(c)?.rightTool)return fail('Нужный инструмент доступен с 3 уровня.');
  if(request.hasToolsInHand!==true)return fail('Нужны воровские или ремесленные инструменты в руке.');
  if(!artisanTools.includes(request.tool))return fail('Выберите один набор ремесленных инструментов.');
  if(request.uninterruptedMinutes!==60||request.spaceWithinReach!==true)return fail('Нужен час непрерывной работы и свободное место в пределах 1,5 м.');
  return {ok:true,tool:request.tool,magical:false,replacesPrevious:true,cost:{minutes:60},expires:'next-right-tool-use'};
}
const api=freeze({sources,slotTable,artisanTools,alchemistSpells,elixirs,infusionCatalog,tinkeringKinds,slots,cantrips,preparedLimit,alwaysPrepared,profile,elixirDefinition,elixirPlan,elixirUsePlan,infusionDefinition,knownInfusionsPlan,infusionPlan,tinkeringPlan,rightToolPlan});
root.DndArtificerRules=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);

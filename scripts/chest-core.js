(function chestCoreModule(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.DndWorldChests=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function chestCoreFactory(){
  'use strict';

  const STATE_SCHEMA='dnd-world-chests/1';
  const CHEST_SCHEMA='dnd-world-chest/1';
  const CREATURE_ENCOUNTER_SCHEMA='dnd-world-chest-creature/1';
  const LOOT_SCHEMA='dnd-world-loot-draft/1';
  const STATES=Object.freeze(['closed','opened','forced','destroyed']);
  const VARIANTS=Object.freeze(['standard','trapped','mimic','creature','decoy','story']);
  const ACTIONS=Object.freeze(['inspect','check','open','pick','disarm','destroy']);
  const RARITY_ORDER=Object.freeze(['common','uncommon','rare','very-rare','legendary','artifact']);
  const RARITY_ALIASES=Object.freeze({
    common:'common','обычный':'common','обычная':'common',uncommon:'uncommon','необычный':'uncommon','необычная':'uncommon',
    rare:'rare','редкий':'rare','редкая':'rare','veryrare':'very-rare','very_rare':'very-rare','very-rare':'very-rare','очень редкий':'very-rare','очень редкая':'very-rare',
    legendary:'legendary','легендарный':'legendary','легендарная':'legendary',artifact:'artifact','артефакт':'artifact',unique:'artifact','уникальный':'artifact'
  });
  const TEMPLATE_ROWS=Object.freeze([
    {id:'wooden-cache',label:'Деревянный тайник',variant:'standard',size:'medium',material:'wood',quality:'ordinary',durability:20,lockType:'simple',lockDC:12,recommendedLevel:1,rewardLevel:0,itemCount:2,rewardMode:'mixed'},
    {id:'iron-vault',label:'Укреплённый железный сундук',variant:'standard',size:'large',material:'iron',quality:'fine',durability:45,lockType:'complex',lockDC:17,recommendedLevel:7,rewardLevel:2,itemCount:3,rewardMode:'mixed'},
    {id:'trapped-vault',label:'Сундук с ловушкой',variant:'trapped',size:'medium',material:'ironbound-wood',quality:'fine',durability:35,lockType:'complex',lockDC:16,recommendedLevel:5,rewardLevel:2,itemCount:3,rewardMode:'mixed',trap:{enabled:true,type:'poison-needle',detectionDC:15,disarmDC:15,saveDC:13,damageFormula:'2d6',damageType:'poison'}},
    {id:'mimic',label:'Сундук-мимик',variant:'mimic',size:'medium',material:'flesh-disguise',quality:'deceptive',durability:58,lockType:'none',lockDC:0,recommendedLevel:3,rewardLevel:1,itemCount:0,rewardMode:'empty',trap:{enabled:false,type:'living-disguise',detectionDC:13,disarmDC:0,saveDC:0,damageFormula:'1d6',damageType:'piercing'}},
    {id:'creature-release',label:'Контейнер с существом',variant:'creature',size:'large',material:'reinforced-wood',quality:'ordinary',durability:30,lockType:'simple',lockDC:13,recommendedLevel:3,rewardLevel:0,itemCount:0,rewardMode:'empty'},
    {id:'decoy',label:'Ложный сундук',variant:'decoy',size:'medium',material:'painted-wood',quality:'deceptive',durability:12,lockType:'simple',lockDC:10,recommendedLevel:1,rewardLevel:0,itemCount:0,rewardMode:'empty'},
    {id:'story',label:'Сюжетный сундук',variant:'story',size:'medium',material:'unique',quality:'story',durability:30,lockType:'story',lockDC:0,recommendedLevel:1,rewardLevel:0,itemCount:1,rewardMode:'fixed'}
  ]);

  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function text(value){return String(value==null?'':value).trim();}
  function int(value,min,max,fallback){const number=Math.floor(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
  function bool(value){return value===true;}
  function unique(values){return [...new Set((values||[]).map(text).filter(Boolean))];}
  function hashString(value){let hash=2166136261;const source=String(value);for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;}
  function seededRandom(seed){let state=hashString(seed)||0x6d2b79f5;return function next(){state=(state+0x6d2b79f5)|0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function rarityOf(value){const key=text(value).toLowerCase().replace(/\s+/g,' ');return RARITY_ALIASES[key]||'common';}
  function rarityIndex(value){return Math.max(0,RARITY_ORDER.indexOf(rarityOf(value)));}
  function levelRarityCap(level){level=int(level,1,20,1);return level>=17?4:(level>=11?3:(level>=5?2:1));}
  function templateOf(id){return clone(TEMPLATE_ROWS.find(row=>row.id===id)||TEMPLATE_ROWS[0]);}

  function normalizeMoney(value){
    const row=value&&typeof value==='object'?value:{},coins={cp:int(row.cp,0,100000000,0),sp:int(row.sp,0,100000000,0),ep:int(row.ep,0,100000000,0),gp:int(row.gp,0,100000000,0),pp:int(row.pp,0,100000000,0)};
    coins.totalCopper=coins.cp+coins.sp*10+coins.ep*50+coins.gp*100+coins.pp*1000;return coins;
  }
  function moneyFromCopper(value){let rest=int(value,0,1000000000,0),pp=Math.floor(rest/1000);rest-=pp*1000;const gp=Math.floor(rest/100);rest-=gp*100;const sp=Math.floor(rest/10);rest-=sp*10;return normalizeMoney({pp,gp,sp,cp:rest});}
  function normalizeLootEntry(value){const row=value&&typeof value==='object'?value:{};return {itemId:text(row.itemId),qty:int(row.qty,1,999,1)};}
  function normalizeLoot(value){
    const row=value&&typeof value==='object'?value:{},draft=row.draft&&typeof row.draft==='object'?row.draft:{};
    return {schemaVersion:LOOT_SCHEMA,status:['empty','draft','approved','claimed'].includes(row.status)?row.status:'empty',seed:text(row.seed),mode:['auto','empty','currency','items','mixed','fixed'].includes(row.mode)?row.mode:'auto',
      draft:{items:Array.isArray(draft.items)?draft.items.map(normalizeLootEntry).filter(entry=>entry.itemId):[],currency:normalizeMoney(draft.currency),notes:text(draft.notes)},
      approved:row.approved&&typeof row.approved==='object'?{items:(row.approved.items||[]).map(normalizeLootEntry).filter(entry=>entry.itemId),currency:normalizeMoney(row.approved.currency),notes:text(row.approved.notes)}:null,
      validation:row.validation&&typeof row.validation==='object'?clone(row.validation):{ok:false,issues:['loot-not-generated']},claimedByActorId:text(row.claimedByActorId)||null};
  }
  function normalizeTrap(value,variant){
    const row=value&&typeof value==='object'?value:{},enabled=variant==='trapped'||bool(row.enabled);
    return {enabled,type:text(row.type)||'needle',detectionDC:int(row.detectionDC,0,40,enabled?13:0),disarmDC:int(row.disarmDC,0,40,enabled?13:0),saveDC:int(row.saveDC,0,40,enabled?12:0),damageFormula:text(row.damageFormula)||'1d6',damageType:text(row.damageType)||'piercing',detected:bool(row.detected),disarmed:bool(row.disarmed),triggered:bool(row.triggered)};
  }
  function normalizeContainer(row,variant){
    const durabilityMax=int(row.durability&&row.durability.max!=null?row.durability.max:row.durability,1,10000,20),current=int(row.durability&&row.durability.current,0,durabilityMax,durabilityMax),lock=row.lock&&typeof row.lock==='object'?row.lock:{};
    return {size:text(row.size)||'medium',material:text(row.material)||'wood',quality:text(row.quality)||'ordinary',durability:{current,max:durabilityMax},
      lock:{type:text(lock.type||row.lockType)||'none',dc:int(lock.dc!=null?lock.dc:row.lockDC,0,40,0),opened:bool(lock.opened)},trap:normalizeTrap(row.trap,variant),
      environment:text(row.environment),recommendedLevel:int(row.recommendedLevel,1,20,1),rewardLevel:int(row.rewardLevel,0,5,0),itemCount:int(row.itemCount,0,50,0),
      rewardMode:['auto','empty','currency','items','mixed','fixed'].includes(row.rewardMode)?row.rewardMode:'auto',lootTable:Array.isArray(row.lootTable)?row.lootTable.map(entry=>({itemId:text(entry.itemId),weight:int(entry.weight,1,10000,1),minLevel:int(entry.minLevel,1,20,1),maxLevel:int(entry.maxLevel,1,20,20),contexts:unique(entry.contexts)})).filter(entry=>entry.itemId):[],loot:normalizeLoot(row.loot)};
  }
  function normalizeChest(value){
    const row=value&&typeof value==='object'?value:{},id=text(row.id);if(!id)throw Object.assign(new Error('Chest id is required.'),{code:'INVALID_CHEST'});
    const variant=VARIANTS.includes(row.variant)?row.variant:'standard',creatureKind=variant==='mimic';
    const base={schemaVersion:creatureKind?CREATURE_ENCOUNTER_SCHEMA:CHEST_SCHEMA,id,name:text(row.name)||'Сундук',templateId:text(row.templateId)||null,variant,kind:creatureKind?'creature':'container',state:STATES.includes(row.state)?row.state:'closed',
      placement:row.placement&&typeof row.placement==='object'?{sceneId:text(row.placement.sceneId)||null,zoneId:text(row.placement.zoneId)||null,position:row.placement.position&&typeof row.placement.position==='object'?clone(row.placement.position):null,placed:bool(row.placement.placed)}:{sceneId:null,zoneId:null,position:null,placed:false},
      knowledge:{inspectedBy:unique(row.knowledge&&row.knowledge.inspectedBy),checkedBy:unique(row.knowledge&&row.knowledge.checkedBy),revealed:bool(row.knowledge&&row.knowledge.revealed),decoyKnown:bool(row.knowledge&&row.knowledge.decoyKnown)},
      revision:int(row.revision,0,1000000000,0),lastOutcome:row.lastOutcome&&typeof row.lastOutcome==='object'?clone(row.lastOutcome):null};
    if(creatureKind){
      const creature=row.creature&&typeof row.creature==='object'?row.creature:{};base.appearance=normalizeContainer(row.appearance&&typeof row.appearance==='object'?row.appearance:row,variant);base.appearance.loot=normalizeLoot({status:'empty',mode:'empty'});
      base.creature={instanceId:text(creature.instanceId),definitionId:text(creature.definitionId)||'system:chest-mimic',revealed:bool(creature.revealed),combatant:creature.combatant!==false};
      if(!base.creature.instanceId)base.creature.instanceId='mimic:'+id;
    }else{
      base.container=normalizeContainer(row.container&&typeof row.container==='object'?row.container:row,variant);
      if(variant==='creature'){const creature=row.creature&&typeof row.creature==='object'?row.creature:{};base.creature={instanceId:text(creature.instanceId)||'released:'+id,definitionId:text(creature.definitionId),revealed:bool(creature.revealed),combatant:creature.combatant!==false};}
    }
    return base;
  }
  function normalizeState(value){const row=value&&typeof value==='object'?value:{},instances=[];for(const input of Array.isArray(row.instances)?row.instances:[]){try{instances.push(normalizeChest(input));}catch(_error){}}return {schemaVersion:STATE_SCHEMA,revision:int(row.revision,0,1000000000,0),instances,events:Array.isArray(row.events)?clone(row.events):[]};}
  function createChest(input){
    input=input||{};const preset=templateOf(input.templateId),id=text(input.id);if(!id)throw Object.assign(new Error('Chest id is required.'),{code:'INVALID_CHEST'});
    const merged=Object.assign({},preset,input,{id,templateId:preset.id,trap:Object.assign({},preset.trap||{},input.trap||{})});if(input.creature)merged.creature=clone(input.creature);return normalizeChest(merged);
  }
  function containerOf(chest){return chest&&chest.kind==='container'?chest.container:null;}
  function physicalOf(chest){return chest&&chest.kind==='creature'?chest.appearance:containerOf(chest);}
  function lootOf(chest){const container=containerOf(chest);return container&&container.loot||null;}

  function normalizeCatalogItem(value){
    const row=value&&typeof value==='object'?value:{},tags=unique(row.tags).map(tag=>tag.toLowerCase()),kind=text(row.kind||row.type).toLowerCase(),contexts=unique(row.contexts).map(tag=>tag.toLowerCase());
    return {id:text(row.id||row.itemId),name:text(row.name||row.n)||text(row.id||row.itemId),rarity:rarityOf(row.rarity),rarityIndex:rarityIndex(row.rarity),kind,tags,contexts,
      minLevel:int(row.minLevel,1,20,1),maxLevel:int(row.maxLevel,1,20,20),unique:bool(row.unique)||tags.includes('unique'),storyOnly:bool(row.storyOnly)||tags.includes('story')||tags.includes('quest'),impossible:bool(row.impossible),stackable:row.stackable!==false};
  }
  function catalogMap(catalog){const map=new Map();for(const input of Array.isArray(catalog)?catalog:[]){const row=normalizeCatalogItem(input);if(row.id&&!map.has(row.id))map.set(row.id,row);}return map;}
  function contextTokens(value){return unique(String(value||'').toLowerCase().split(/[^a-zа-яё0-9_-]+/i));}
  function itemAllowed(item,options){
    if(!item||!item.id||item.impossible||item.kind==='container'||item.kind==='creature'||item.tags.includes('container')||item.storyOnly)return false;
    if(options.level<item.minLevel||options.level>item.maxLevel||item.rarityIndex>options.rarityCap)return false;
    if(item.contexts.length&&options.context.length&&!item.contexts.some(token=>options.context.includes(token)))return false;return true;
  }
  function candidateRows(chest,catalog){
    const container=containerOf(chest);if(!container)return [];const map=catalogMap(catalog),level=container.recommendedLevel,rarityCap=Math.min(levelRarityCap(level),container.rewardLevel),context=contextTokens(container.environment),options={level,rarityCap,context},rows=[];
    const table=container.lootTable.length?container.lootTable.map(row=>({table:row,item:map.get(row.itemId)})):Array.from(map.values()).map(item=>({table:null,item}));
    for(const row of table){const item=row.item;if(!itemAllowed(item,options))continue;if(row.table&&(level<row.table.minLevel||level>row.table.maxLevel||row.table.contexts.length&&context.length&&!row.table.contexts.some(token=>context.includes(token.toLowerCase()))))continue;
      let weight=row.table?row.table.weight:Math.max(1,12-item.rarityIndex*2);if(context.length&&(item.contexts.some(token=>context.includes(token))||item.tags.some(token=>context.includes(token))))weight*=3;rows.push({item,weight});}
    return rows;
  }
  function weightedPick(rows,random){const total=rows.reduce((sum,row)=>sum+row.weight,0);if(total<=0)return null;let roll=random()*total;for(const row of rows){roll-=row.weight;if(roll<0)return row;}return rows[rows.length-1]||null;}
  function generationMode(container,random){if(container.rewardMode!=='auto')return container.rewardMode;const roll=random();return roll<0.12?'empty':(roll<0.35?'currency':(roll<0.62?'items':'mixed'));}
  function currencyFor(container,random){const bases=[500,2500,10000,50000,250000,1000000],base=bases[container.rewardLevel]||bases[0],levelFactor=0.65+container.recommendedLevel/20;return moneyFromCopper(Math.max(1,Math.round(base*levelFactor*(0.75+random()*0.5))));}
  function validateLootDraft(chest,catalog,draft){
    const container=containerOf(chest),issues=[];if(!container)issues.push('CREATURE_IS_NOT_CONTAINER');const map=catalogMap(catalog),level=container&&container.recommendedLevel||1,rarityCap=container?Math.min(levelRarityCap(level),container.rewardLevel):0,context=container?contextTokens(container.environment):[];
    const normalized={items:((draft&&draft.items)||[]).map(normalizeLootEntry).filter(row=>row.itemId),currency:normalizeMoney(draft&&draft.currency),notes:text(draft&&draft.notes)};
    for(const entry of normalized.items){const item=map.get(entry.itemId);if(!item)issues.push('UNKNOWN_ITEM_ID:'+entry.itemId);else if(!itemAllowed(item,{level,rarityCap,context})&&chest.variant!=='story')issues.push('INCOMPATIBLE_ITEM:'+entry.itemId);}
    return {ok:issues.length===0,issues,draft:normalized};
  }
  function generateLoot(chestInput,catalog,seedOverride){
    const chest=normalizeChest(chestInput);if(chest.kind!=='container')return {ok:false,code:'CREATURE_IS_NOT_CONTAINER',reason:'A mimic is a creature encounter and cannot generate container loot.'};
    const container=chest.container,catalogIds=catalogMap(catalog),missingTableIds=container.lootTable.map(row=>row.itemId).filter(itemId=>!catalogIds.has(itemId));if(missingTableIds.length)return {ok:false,code:'UNKNOWN_LOOT_TABLE_ITEM',reason:'Loot table references unknown Item IDs.',issues:missingTableIds.map(itemId=>'UNKNOWN_ITEM_ID:'+itemId)};
    const seed=text(seedOverride)||text(container.loot.seed)||chest.id+':loot',random=seededRandom(seed),mode=generationMode(container,random),draft={items:[],currency:normalizeMoney(null),notes:''};
    if(mode==='currency'||mode==='mixed')draft.currency=currencyFor(container,random);
    if(mode==='items'||mode==='mixed'||mode==='fixed'){
      const candidates=candidateRows(chest,catalog),selected=new Set(),count=container.itemCount;if(count>0&&!candidates.length)return {ok:false,code:'NO_COMPATIBLE_LOOT',reason:'No existing Item ID is compatible with level, rarity and scene context.',issues:['NO_COMPATIBLE_LOOT']};
      for(let index=0;index<count;index++){let available=candidates.filter(row=>row.item.stackable||!selected.has(row.item.id)),picked=weightedPick(available,random);if(!picked)break;const existing=draft.items.find(row=>row.itemId===picked.item.id);if(existing&&picked.item.stackable)existing.qty++;else draft.items.push({itemId:picked.item.id,qty:1});selected.add(picked.item.id);}
    }
    const validation=validateLootDraft(chest,catalog,draft);chest.container.loot={schemaVersion:LOOT_SCHEMA,status:'draft',seed,mode,draft:validation.draft,approved:null,validation:{ok:validation.ok,issues:validation.issues},claimedByActorId:null};
    return {ok:validation.ok,chest,loot:clone(chest.container.loot),code:validation.ok?'GENERATED':'INVALID_GENERATED_LOOT',issues:validation.issues};
  }
  function replaceLootDraft(chestInput,catalog,draft){const chest=normalizeChest(chestInput),loot=lootOf(chest);if(!loot)return {ok:false,code:'CREATURE_IS_NOT_CONTAINER'};const validation=validateLootDraft(chest,catalog,draft);loot.status='draft';loot.draft=validation.draft;loot.approved=null;loot.validation={ok:validation.ok,issues:validation.issues};loot.claimedByActorId=null;return {ok:validation.ok,chest,loot:clone(loot),issues:validation.issues};}
  function approveLoot(chestInput,catalog){const chest=normalizeChest(chestInput),loot=lootOf(chest);if(!loot)return {ok:false,code:'CREATURE_IS_NOT_CONTAINER'};const validation=validateLootDraft(chest,catalog,loot.draft);loot.validation={ok:validation.ok,issues:validation.issues};if(!validation.ok)return {ok:false,code:'LOOT_VALIDATION_FAILED',issues:validation.issues,chest};loot.status='approved';loot.approved=clone(validation.draft);return {ok:true,chest,loot:clone(loot)};}

  function actionReject(code,reason){return {allowed:false,reasonCode:code,explanation:reason};}
  function evaluateAction(chestInput,action,context){
    let chest;try{chest=normalizeChest(chestInput);}catch(error){return actionReject(error.code||'INVALID_CHEST',String(error.message||error));}context=context||{};action=text(action);if(!ACTIONS.includes(action))return actionReject('UNKNOWN_CHEST_ACTION','Неизвестное действие с сундуком.');
    if(!chest.placement.placed)return actionReject('CHEST_NOT_PLACED','Сундук ещё не размещён на сцене.');if(!text(context.actorId))return actionReject('CHEST_ACTOR_REQUIRED','Выберите персонажа, который действует.');if(context.actorAlive===false)return actionReject('ACTOR_DOWN','Персонаж без сознания и не может действовать.');
    const physical=physicalOf(chest),container=containerOf(chest),trap=physical&&physical.trap;
    if(action==='inspect')return {allowed:true,reasonCode:'ALLOWED',explanation:'Можно осмотреть объект без броска.'};
    if(chest.state==='destroyed')return actionReject('CHEST_DESTROYED','Сундук уничтожен; это действие больше невозможно.');
    if(action==='check')return {allowed:true,reasonCode:'ALLOWED',explanation:'Требуется фактический d20 проверки.'};
    if(action==='destroy')return physical&&physical.durability.current>0?{allowed:true,reasonCode:'ALLOWED',explanation:'Требуется ввести фактический урон объекту.'}:actionReject('CHEST_NO_DURABILITY','Объект уже не имеет прочности.');
    if(chest.kind==='creature'){
      if(action==='open'&&!chest.creature.revealed)return {allowed:true,reasonCode:'ALLOWED',explanation:'Попытка открыть раскроет существо и передаст его боевому движку.'};
      return actionReject('CREATURE_NOT_CONTAINER','Мимик является игровым существом, а не обычным контейнером.');
    }
    if(chest.state==='opened')return actionReject('CHEST_ALREADY_OPEN','Сундук уже открыт.');
    if(action==='pick'){
      if(container.lock.type==='none')return actionReject('CHEST_HAS_NO_LOCK','У сундука нет замка.');if(container.lock.opened||chest.state==='forced')return actionReject('CHEST_ALREADY_UNLOCKED','Замок уже вскрыт.');if(container.lock.type==='story'&&container.lock.dc<=0)return actionReject('STORY_LOCK_REQUIRES_KEY','Сюжетный замок нельзя вскрыть обычной проверкой.');return {allowed:true,reasonCode:'ALLOWED',explanation:'Требуется фактический d20 Ловкости рук.'};
    }
    if(action==='disarm'){
      if(!trap.enabled)return actionReject('CHEST_HAS_NO_TRAP','У сундука нет ловушки.');if(!trap.detected)return actionReject('TRAP_NOT_DETECTED','Сначала ловушку нужно обнаружить проверкой.');if(trap.disarmed)return actionReject('TRAP_ALREADY_DISARMED','Ловушка уже обезврежена.');if(trap.triggered)return actionReject('TRAP_ALREADY_TRIGGERED','Ловушка уже сработала.');return {allowed:true,reasonCode:'ALLOWED',explanation:'Требуется фактический d20 Ловкости рук.'};
    }
    if(action==='open'){
      if(container.lock.type!=='none'&&!container.lock.opened&&chest.state!=='forced')return actionReject('CHEST_LOCKED','Сундук заперт; нужен ключ, вскрытие замка или разрушение.');
      if(chest.variant==='story'&&(!container.loot||container.loot.status!=='approved'))return actionReject('STORY_LOOT_NOT_APPROVED','Фиксированное сюжетное содержимое ещё не утверждено мастером.');
      if(chest.variant!=='creature'&&chest.variant!=='decoy'&&(!container.loot||container.loot.status!=='approved'))return actionReject('LOOT_NOT_APPROVED','Мастер ещё не утвердил содержимое сундука.');
      if(chest.variant==='creature'&&!chest.creature.definitionId)return actionReject('CREATURE_DEFINITION_REQUIRED','Для контейнера не выбрано существующее определение существа.');return {allowed:true,reasonCode:'ALLOWED',explanation:trap.enabled&&!trap.disarmed?'Открытие активирует структурированную ловушку.':'Сундук можно открыть.'};
    }
    return actionReject('CHEST_ACTION_BLOCKED','Действие сейчас невозможно.');
  }
  function actionOutcome(chest,action,success,code,message,extra){chest.revision++;chest.lastOutcome=Object.assign({action,success,code,message},extra||{});return {ok:true,success,code,message,chest,event:clone(chest.lastOutcome)};}
  function applyAction(chestInput,action,resolution){
    const chest=normalizeChest(chestInput),check=evaluateAction(chest,action,{actorId:text(resolution&&resolution.actorId)||'actor',actorAlive:resolution&&resolution.actorAlive!==false});if(!check.allowed)return {ok:false,code:check.reasonCode,reason:check.explanation,chest};resolution=resolution||{};const actorId=text(resolution.actorId),physical=physicalOf(chest),container=containerOf(chest),total=Number(resolution.total);
    if(action==='inspect'){chest.knowledge.inspectedBy=unique(chest.knowledge.inspectedBy.concat(actorId));return actionOutcome(chest,action,true,'INSPECTED','Объект осмотрен.',{actorId});}
    if(action==='check'){
      chest.knowledge.checkedBy=unique(chest.knowledge.checkedBy.concat(actorId));const dc=chest.kind==='creature'?physical.trap.detectionDC:(physical.trap.enabled?physical.trap.detectionDC:(chest.variant==='decoy'?10:0)),success=Number.isFinite(total)&&total>=dc;
      if(success){if(chest.kind==='creature')chest.knowledge.revealed=true;else if(chest.variant==='decoy')chest.knowledge.decoyKnown=true;else if(physical.trap.enabled)physical.trap.detected=true;}
      return actionOutcome(chest,action,success,success?'CHECK_SUCCEEDED':'CHECK_FAILED',success?'Проверка раскрыла скрытые свойства объекта.':'Проверка не раскрыла скрытых свойств.',{actorId,total,dc});
    }
    if(action==='pick'){const success=Number.isFinite(total)&&total>=container.lock.dc;if(success){container.lock.opened=true;chest.state='forced';}return actionOutcome(chest,action,success,success?'LOCK_PICKED':'LOCK_PICK_FAILED',success?'Замок вскрыт.':'Замок не поддался.',{actorId,total,dc:container.lock.dc});}
    if(action==='disarm'){const success=Number.isFinite(total)&&total>=physical.trap.disarmDC;if(success)physical.trap.disarmed=true;return actionOutcome(chest,action,success,success?'TRAP_DISARMED':'TRAP_DISARM_FAILED',success?'Ловушка обезврежена.':'Ловушка не обезврежена; иных последствий без отдельного правила нет.',{actorId,total,dc:physical.trap.disarmDC});}
    if(action==='destroy'){const damage=Math.max(0,int(resolution.damage,0,1000000,0));physical.durability.current=Math.max(0,physical.durability.current-damage);const destroyed=physical.durability.current===0;if(destroyed)chest.state='destroyed';return actionOutcome(chest,action,destroyed,destroyed?'CHEST_DESTROYED':'CHEST_DAMAGED',destroyed?'Сундук уничтожен.':'Сундук повреждён, но не уничтожен.',{actorId,damage,durability:clone(physical.durability)});}
    if(action==='open'){
      if(chest.kind==='creature'){chest.creature.revealed=true;chest.knowledge.revealed=true;return actionOutcome(chest,action,true,'CREATURE_REVEALED','Облик сундука раскрыт: это игровое существо.',{actorId,creatureInstanceId:chest.creature.instanceId,requiresCombatEngine:true});}
      chest.state='opened';if(chest.variant==='decoy')return actionOutcome(chest,action,true,'DECOY_OPENED','Ложный сундук открыт; содержимого нет.',{actorId});
      if(chest.variant==='creature'){chest.creature.revealed=true;return actionOutcome(chest,action,true,'CREATURE_RELEASED','Из контейнера появляется игровое существо.',{actorId,creatureInstanceId:chest.creature.instanceId,requiresCombatEngine:true});}
      const triggered=physical.trap.enabled&&!physical.trap.disarmed;if(triggered)physical.trap.triggered=true;return actionOutcome(chest,action,true,triggered?'CHEST_OPENED_TRAP_TRIGGERED':'CHEST_OPENED',triggered?'Сундук открыт; ловушка сработала и требует структурированного разрешения.':'Сундук открыт.',{actorId,trapTriggered:triggered,lootReady:!!(container.loot&&container.loot.approved)});
    }
    return {ok:false,code:'UNKNOWN_CHEST_ACTION',reason:'Неизвестное действие.',chest};
  }

  return Object.freeze({STATE_SCHEMA,CHEST_SCHEMA,CREATURE_ENCOUNTER_SCHEMA,LOOT_SCHEMA,STATES,VARIANTS,ACTIONS,RARITY_ORDER,TEMPLATES:TEMPLATE_ROWS,
    clone,seededRandom,rarityOf,rarityIndex,levelRarityCap,templateOf,normalizeMoney,moneyFromCopper,normalizeLoot,normalizeChest,normalizeState,createChest,containerOf,physicalOf,lootOf,
    normalizeCatalogItem,candidateRows,validateLootDraft,generateLoot,replaceLootDraft,approveLoot,evaluateAction,applyAction});
});

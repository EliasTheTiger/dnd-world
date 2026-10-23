'use strict';
// Only these four infusions expose playable actions. Catalog definitions of
// later options never silently grant effects the tabletop engine cannot resolve.
function artificerPlayableInfusions(){return ['enhanced-defense','enhanced-weapon','repeating-shot','returning-weapon'];}
function artificerInfusionState(c){
 const state=c?.artificer?.infusions;if(!state)return {version:1,revision:0,known:[],active:[],restReady:false};
 if(state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.known)||!Array.isArray(state.active)||typeof state.restReady!=='boolean')return null;
 const p=globalThis.DndArtificerRules.profile(c);if(!p||state.known.length>p.infusionsKnown||state.active.length>p.infusedItems||new Set(state.known).size!==state.known.length||state.known.some(id=>!artificerPlayableInfusions().includes(id)))return null;
 if(state.active.some(r=>!r||typeof r.itemId!=='string'||!state.known.includes(r.infusionId))||new Set(state.active.map(r=>r.itemId)).size!==state.active.length||new Set(state.active.map(r=>r.infusionId)).size!==state.active.length)return null;
 return state;
}
function artificerWorldToken(c){return JSON.stringify([c?.cls,c?.level,c?.artificer?.infusions,chars.map(h=>[h.id,h.inventory,h.equipment,h.hp]),fxRound,combat.active,combat.turn]);}
function artificerRestToken(c){const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;return JSON.stringify([c.cls,c.level,c.hp,stable(c.slots),stable(c.magicResource),fxRound]);}
function artificerLongRest(c){
 if(!globalThis.DndArtificerRules.profile(c)?.infusionsKnown)return;
 const state=artificerInfusionState(c);if(!state)return;
 c.artificer=c.artificer||{};c.artificer.infusions={...state,revision:state.revision+1,restReady:true,restToken:artificerRestToken(c)};
}
function artificerEntryRows(){return chars.flatMap(owner=>(owner.inventory||[]).map(entry=>({owner,entry,item:itemOf(entry.itemId)})).filter(row=>row.item&&row.entry.qty>0));}
function artificerInfusionOf(holder,entry){
 if(!holder||!entry||entry.qty!==1)return null;
 const candidates=[];
 for(const creator of chars){if(!creator.artificer?.infusions?.active?.some(r=>r.itemId===entry.id))continue;const state=artificerInfusionState(creator);if(!state)continue;const row=state.active.find(r=>r.itemId===entry.id);if(!row)continue;
  const definition=globalThis.DndArtificerRules.infusionDefinition(row.infusionId,creator.level);if(!definition)continue;
  if(Number.isFinite(state.creatorDiedAt)&&fxRound>=state.creatorDiedAt+Math.max(1,globalThis.DndArtificerRules.profile(creator).intelligenceModifier)*14400)continue;
  candidates.push({creator,row,definition});
 }
 if(candidates.length!==1)return null;
 let copies=0;for(const owner of chars)for(const e of owner.inventory||[]){if(e.id===entry.id&&e.qty>0&&++copies>1)return null;}
 return copies===1?candidates[0]:null;
}
function artificerEntryAttuned(holder,entry){const row=artificerInfusionOf(holder,entry);return !!entry?.att&&(!row?.definition.attunement||(entry.artificerAttunedTo||row.creator.id)===holder.id);}
function artificerAttunementChanged(c,e){if(!artificerInfusionOf(c,e))return;if(e.att)e.artificerAttunedTo=c.id;else delete e.artificerAttunedTo;}
function artificerInfusionActive(holder,entry){const row=artificerInfusionOf(holder,entry);return row&&(!row.definition.attunement||entry.att&&(entry.artificerAttunedTo||row.creator.id)===holder.id)&&!(holder.activeFx||[]).some(f=>f.antimagic)?row:null;}
function artificerNeedsAttune(c,e){return !!artificerInfusionOf(c,e)?.definition.attunement;}
function artificerCreatorDied(c){const state=artificerInfusionState(c);if(!state||state.creatorDiedAt!=null)return;c.artificer=c.artificer||{};c.artificer.infusions={...state,creatorDiedAt:fxRound,revision:state.revision+1};}
function artificerFxSources(c){
 const creators=chars.filter(h=>h.artificer?.infusions?.active?.length||h.artificer?.tinkering?.active?.length);if(!creators.length)return [];
 const worn=new Set(Object.values(c.equipment||{})),out=[];
 if(creators.some(h=>h.artificer?.infusions?.active?.some(r=>worn.has(r.itemId))))for(const id of worn){const e=(c.inventory||[]).find(entry=>entry.id===id);if(!e)continue;const row=artificerInfusionActive(c,e);if(row?.definition.effects.armorClassBonus)out.push({k:'artificer',id:'infusion:'+row.creator.id+':'+e.id,label:row.definition.name,why:itemOf(e.itemId)?.n||'',fx:[{stat:'ac',mode:'add',value:row.definition.effects.armorClassBonus}],canOff:false});}
 for(const creator of creators)for(const row of creator.artificer?.tinkering?.active||[]){if(row.kind!=='light')continue;const e=(c.inventory||[]).find(e=>e.id===row.itemId&&e.qty>0);if(e&&!(c.activeFx||[]).some(f=>f.antimagic))out.push({k:'artificer',id:'tinkering:'+creator.id+':'+e.id,label:'Магическое мастерство: свет',why:itemOf(e.itemId)?.n||'',fx:[{stat:'light.bright',mode:'max',value:1.5},{stat:'light.dim',mode:'max',value:1.5}],canOff:false});}
 return out;
}
function artificerWeaponProfile(c,entryId,profile){
 const e=invEntryOf(c,entryId),row=artificerInfusionActive(c,e);if(!row||!profile.weapon)return profile;
 const result=itemClone(profile);result.flags={...(result.flags||{}),magical:true};result.weapon.magic=true;result.weapon.damageTraits={...result.weapon.damageTraits,magical:true};
 if(row.definition.effects.createsAmmunition)result.weapon.ammo=false;
 if(row.definition.effects.ignoreLoading)result.weapon.loading=false;
 return result;
}
function artificerWeaponBonus(c,entryId,base){const row=artificerInfusionActive(c,invEntryOf(c,entryId)),effect=row?.definition.effects;return {atk:(base?.atk||0)+(effect?.attackBonus||0),dmg:(base?.dmg||0)+(effect?.damageBonus||0)};}
function artificerWeaponMagical(c,entryId){return !!artificerInfusionActive(c,invEntryOf(c,entryId))?.definition.effects.magicalWeapon;}
function artificerReturningWeapon(c,entryId){return !!artificerInfusionActive(c,invEntryOf(c,entryId))?.definition.effects.returnsAfterRangedAttack;}
function artificerToolName(it){const prof=itemProfile(it)?.tool?.prof;return String(prof||it?.n||'').trim();}
function artificerToolAllowed(c,it,proficiency=true){
 const name=artificerToolName(it),allowed=name==='Воровские инструменты'||globalThis.DndArtificerRules.artisanTools.includes(name);
 return allowed&&(!proficiency||toolProficiencyHas(c,{prof:name}));
}
function artificerHeldIds(c){return [...new Set(['MAIN_HAND','OFF_HAND','TWO_HAND'].map(k=>c.equipment?.[k]).filter(Boolean))];}
function artificerHeldTool(c){return (c.inventory||[]).find(e=>e.qty>0&&artificerHeldIds(c).includes(e.id)&&artificerToolAllowed(c,itemOf(e.itemId),false))||null;}
function artificerSpellFocus(c){
 if(c?.cls!=='Изобретатель')return null;
 for(const id of artificerHeldIds(c)){const e=invEntryOf(c,id),it=e&&itemOf(e.itemId);if(!e||e.qty<=0||!it||['armor','shield'].includes(itemProfile(it)?.kind)&&id===c.equipment?.CHEST)continue;
  const infusion=artificerInfusionActive(c,e),own=infusion?.creator.id===c.id;
  if(artificerToolAllowed(c,it,true)||own)return {e,it,label:userFacingItemName(it,'Фокусировка изобретателя')};
 }
 return null;
}
function artificerSpellFocusCheck(c){return c?.cls!=='Изобретатель'||artificerSpellFocus(c)?{ok:true}:{ok:false,reason:'Для каждого заклинания изобретателя держите в руке воровские или ремесленные инструменты, которыми владеете, либо свой предмет с инфузией. Возьмите фокусировку в профиле.'};}
function artificerActorCheck(c,cost){
 if(!c||!globalThis.DndArtificerRules.profile(c))return {ok:false,reason:'Изобретатель не найден.'};
 if(c.hp<=0||ACTION_BLOCK_CONDS.some(n=>effectiveConditions(c).includes(n)))return {ok:false,reason:'Состояние героя не позволяет выполнить действие.'};
 if(combat.active&&!combatCanSpendPure(cost,'ally:'+c.id))return {ok:false,reason:'Нужно свободное действие в свой ход.'};return {ok:true};
}
function artificerCommitCost(c,cost,label){if(combat.active&&!combatSpend(cost,label,'ally:'+c.id))throw Error('Действие недоступно.');}
function artificerNormalizedItems(c){
 return (c.inventory||[]).filter(e=>e.qty>0).map(e=>{const it=itemOf(e.itemId),p=it&&itemProfile(it),w=p?.weapon,tinkered=chars.some(h=>(h.artificer?.tinkering?.active||[]).some(r=>r.itemId===e.id));return {id:e.id,kind:p?.kind||'',magic:!!(p?.flags?.magical||w?.magic||w?.damageTraits?.magical||tinkered),weaponCategory:w?(w.category||'simple'):'',properties:w?[...(w.ammo?['ammunition']:[]),...(w.thrown?['thrown']:[])]:[]};});
}
function artificerInfusionsApply(charId,selections){
 const initial=getCh(charId),token=initial&&artificerWorldToken(initial),prepare=()=>{
  const c=getCh(charId),state=artificerInfusionState(c),actor=artificerActorCheck(c,'action');if(!actor.ok)return actor;
  if(!state||artificerWorldToken(c)!==token)return {ok:false,reason:'Состояние героя или предметов изменилось. Откройте выбор заново.'};
  if(combat.active||!state.restReady||state.restToken!==artificerRestToken(c))return {ok:false,reason:'Распределите инфузии сразу после долгого отдыха, до следующих действий.'};
  const items=artificerNormalizedItems(c);for(const row of selections||[]){const other=artificerEntryRows().find(x=>x.entry.id===row.itemId);if(other&&artificerInfusionOf(other.owner,other.entry)?.creator.id!==c.id&&artificerInfusionOf(other.owner,other.entry))return {ok:false,reason:'На предмете уже есть инфузия другого изобретателя.'};}
  const plan=globalThis.DndArtificerRules.infusionPlan(c,state.known,selections,{longRestCompleted:true,items});return plan.ok?{ok:true,c,state,plan}:plan;
 };
 return arcanumAction('artificer-infusions:'+charId,prepare,p=>{for(const row of p.plan.active){const entry=invEntryOf(p.c,row.itemId);if(entry.qty>1){p.c.inventory.push({...itemClone(entry),id:fxUid(),qty:entry.qty-1,att:false});entry.qty=1;}}
  p.c.artificer=p.c.artificer||{};p.c.artificer.infusions={...p.state,active:p.plan.active.map(r=>({infusionId:r.infusionId,itemId:r.itemId})),revision:p.state.revision+1,restReady:false};for(const row of p.plan.active){if(!row.attunement)continue;const e=invEntryOf(p.c,row.itemId);if(!artificerEntryAttuned(p.c,e)&&attunedEntries(p.c).length<globalThis.DndArtificerRules.profile(p.c).attunementLimit){e.att=true;e.artificerAttunedTo=p.c.id;}}castLogLine(p.c.name+': инфузии распределены ('+p.plan.active.length+').');});
}
function artificerInfusionsOpen(charId){
 const c=getCh(charId),state=artificerInfusionState(c);if(!c||!state)return false;
 try{const limit=globalThis.DndArtificerRules.profile(c).infusedItems,selections=[],count=arcanumPromptNumber('Сколько предметов насытить инфузиями? От 0 до '+limit);if(!Number.isInteger(count)||count<0||count>limit)throw Error('Проверьте число предметов.');
  for(let i=0;i<count;i++){const id=arcanumChoose('Инфузия '+(i+1),state.known.filter(id=>!selections.some(r=>r.infusionId===id)).map(id=>({value:id,label:globalThis.DndArtificerRules.infusionDefinition(id,c.level).name}))),items=artificerNormalizedItems(c).filter(item=>!selections.some(r=>r.itemId===item.id)&&globalThis.DndArtificerRules.infusionPlan(c,state.known,[{infusionId:id,itemId:item.id}],{longRestCompleted:true,items:[item]}).ok),itemId=arcanumChoose('Немагический предмет',items.map(item=>({value:item.id,label:itemOf(invEntryOf(c,item.id).itemId).n})));selections.push({infusionId:id,itemId});}
  return artificerInfusionsApply(charId,selections);
 }catch(error){setStatus(error.message==='cancelled'?'Выбор отменён; инфузии не изменены.':error.message,true);return false;}
}
function artificerFocusTake(charId,entryId){
 const initial=getCh(charId),token=initial&&artificerWorldToken(initial),prepare=()=>{const c=getCh(charId),e=c&&invEntryOf(c,entryId),it=e&&itemOf(e.itemId),check=artificerActorCheck(c,'object');if(!check.ok)return check;
  if(artificerWorldToken(c)!==token||!e||e.qty<=0||!it)return {ok:false,reason:'Предмет изменился.'};const row=artificerInfusionActive(c,e);if(!artificerToolAllowed(c,it,true)&&row?.creator.id!==c.id)return {ok:false,reason:'Этот предмет не подходит как фокусировка.'};
  if(artificerHeldIds(c).includes(entryId))return {ok:false,reason:'Фокусировка уже в руке.'};if(c.equipment?.TWO_HAND)return {ok:false,reason:'Сначала уберите двуручное оружие, чтобы освободить руку.'};
  const slot=!c.equipment?.MAIN_HAND?'MAIN_HAND':!c.equipment?.OFF_HAND?'OFF_HAND':'';if(!slot)return {ok:false,reason:'Освободите руку для фокусировки.'};return {ok:true,c,e,slot};};
 return arcanumAction('artificer-focus:'+charId,prepare,p=>{artificerCommitCost(p.c,'object','Взять фокусировку');p.c.equipment=p.c.equipment||{};p.c.equipment[p.slot]=p.e.id;castLogLine(p.c.name+': фокусировка в руке.');});
}
function artificerFocusOpen(charId){const c=getCh(charId);if(!c)return false;try{const id=arcanumChoose('Взять фокусировку в свободную руку',(c.inventory||[]).filter(e=>e.qty>0&&(artificerToolAllowed(c,itemOf(e.itemId),true)||artificerInfusionActive(c,e)?.creator.id===c.id)).map(e=>({value:e.id,label:itemOf(e.itemId)?.n||e.itemId})));return artificerFocusTake(charId,id);}catch(error){setStatus(error.message==='cancelled'?'Выбор отменён.':error.message,true);return false;}}
function artificerTinker(charId,input){
 const initial=getCh(charId),token=initial&&artificerWorldToken(initial),prepare=()=>{const c=getCh(charId),actor=artificerActorCheck(c,'action');if(!actor.ok)return actor;if(artificerWorldToken(c)!==token)return {ok:false,reason:'Герой или инвентарь изменились.'};
  const e=invEntryOf(c,input.itemId),it=e&&itemOf(e.itemId);if(!e||e.qty!==1||!it)return {ok:false,reason:'Выберите отдельный предмет в инвентаре.'};
  const p=itemProfile(it),tinkered=chars.some(h=>(h.artificer?.tinkering?.active||[]).some(r=>r.itemId===e.id)),nonmagical=!(p.flags?.magical||p.weapon?.magic||artificerInfusionOf(c,e)||tinkered),plan=globalThis.DndArtificerRules.tinkeringPlan(c,{...input,nonmagical,hasToolsInHand:!!artificerHeldTool(c)},c.artificer?.tinkering?.active||[]);return plan.ok?{ok:true,c,plan}:plan;};
 return arcanumAction('artificer-tinker:'+charId,prepare,p=>{artificerCommitCost(p.c,'action','Магическое мастерство');p.c.artificer=p.c.artificer||{};p.c.artificer.tinkering={version:1,revision:(p.c.artificer.tinkering?.revision||0)+1,active:p.plan.active};castLogLine(p.c.name+': магическое мастерство.');});
}
function artificerTinkerDismiss(charId,itemId){const prepare=()=>{const c=getCh(charId),check=artificerActorCheck(c,'action');return check.ok&&c.artificer?.tinkering?.active.some(r=>r.itemId===itemId)?{ok:true,c}:check.ok?{ok:false,reason:'Свойство уже снято.'}:check;};return arcanumAction('artificer-dismiss:'+charId,prepare,p=>{artificerCommitCost(p.c,'action','Снять магическое свойство');p.c.artificer.tinkering.active=p.c.artificer.tinkering.active.filter(r=>r.itemId!==itemId);p.c.artificer.tinkering.revision++;castLogLine(p.c.name+': свойство магического мастерства снято.');});}
function artificerTinkerOpen(charId){
 const c=getCh(charId);if(!c)return false;try{const itemId=arcanumChoose('Крошечный немагический предмет',(c.inventory||[]).filter(e=>e.qty===1&&!artificerInfusionOf(c,e)).map(e=>({value:e.id,label:itemOf(e.itemId)?.n||e.itemId}))),kind=arcanumChoose('Магическое свойство',[{value:'light',label:'Свет: 1,5 м яркий + 1,5 м тусклый'},{value:'message',label:'Сообщение до 6 секунд'},{value:'sensory',label:'Невербальный звук или запах'},{value:'image',label:'Изображение или текст до 25 слов'}]),input={itemId,kind,tiny:arcanumPromptBool('Мастер подтверждает: предмет крошечный и находится в пределах касания')};if(kind!=='light')input.text=arcanumPromptText('Что предмет показывает или воспроизводит?');if(kind==='message')input.seconds=arcanumPromptNumber('Длительность сообщения, секунд (не больше 6)');return artificerTinker(charId,input);}catch(error){setStatus(error.message==='cancelled'?'Действие отменено; ничего не потрачено.':error.message,true);return false;}
}
function artificerRightTool(charId,input){
 const initial=getCh(charId),token=initial&&artificerWorldToken(initial),prepare=()=>{const c=getCh(charId),actor=artificerActorCheck(c,'action');if(!actor.ok)return actor;if(artificerWorldToken(c)!==token||combat.active)return {ok:false,reason:'Работа выполняется вне боя; состояние героя должно оставаться прежним.'};
  const plan=globalThis.DndArtificerRules.rightToolPlan(c,{...input,hasToolsInHand:!!artificerHeldTool(c)});if(!plan.ok)return plan;const item=itemsDB.find(it=>artificerToolName(it)===input.tool);if(!item)return {ok:false,reason:'Набор инструментов отсутствует в каталоге.'};
  const time=recipeTabletopTimeCheck(600);return time.ok?{ok:true,c,plan,item}:time;};
 return arcanumAction('artificer-right-tool:'+charId,prepare,p=>{if(advanceFxRound(600)===false)throw Error('Сначала завершите последствия проходящего времени.');for(const owner of chars){const removed=(owner.inventory||[]).filter(e=>e.artificerCreatedTool===charId).map(e=>e.id);owner.inventory=(owner.inventory||[]).filter(e=>!removed.includes(e.id));for(const [slot,id] of Object.entries(owner.equipment||{}))if(removed.includes(id))delete owner.equipment[slot];}
  const entry={id:fxUid(),itemId:p.item.id,qty:1,artificerCreatedTool:charId};p.c.inventory.push(entry);p.c.artificer=p.c.artificer||{};p.c.artificer.tools={version:1,entryId:entry.id,tool:p.plan.tool,createdAtRound:fxRound};castLogLine(p.c.name+': за час создан набор «'+p.plan.tool+'»; предыдущий созданный набор исчез.');});
}
function artificerRightToolOpen(charId){try{const tool=arcanumChoose('Какой набор ремесленных инструментов создать?',globalThis.DndArtificerRules.artisanTools.map(t=>({value:t,label:t}))),confirmed=arcanumPromptBool('Час непрерывной работы завершён, рядом свободное место в пределах 1,5 м');return artificerRightTool(charId,{tool,uninterruptedMinutes:confirmed?60:0,spaceWithinReach:confirmed});}catch(error){setStatus(error.message==='cancelled'?'Работа отменена.':error.message,true);return false;}}
function artificerAttune(charId,entryId,confirmed){
 const initial=getCh(charId),token=initial&&artificerWorldToken(initial),prepare=()=>{const c=getCh(charId),e=c&&invEntryOf(c,entryId),row=e&&artificerInfusionOf(c,e);if(!c||!e||!row?.definition.attunement||artificerWorldToken(c)!==token)return {ok:false,reason:'Предмет или герой изменились.'};
  if(combat.active||c.hp<=0||ACTION_BLOCK_CONDS.some(n=>effectiveConditions(c).includes(n))||confirmed!==true)return {ok:false,reason:'Нужен короткий отдых с предметом в течение часа вне боя.'};
  if(artificerEntryAttuned(c,e))return {ok:false,reason:'Этот предмет уже настроен на героя.'};if(attunedEntries(c).length>=(globalThis.DndArtificerRules.profile(c)?.attunementLimit||3))return {ok:false,reason:'Сначала освободите место настройки.'};const time=recipeTabletopTimeCheck(600);return time.ok?{ok:true,c,e}:time;};
 return arcanumAction('artificer-attune:'+charId+':'+entryId,prepare,p=>{if(advanceFxRound(600)===false)throw Error('Не удалось завершить время настройки.');p.e.att=true;p.e.artificerAttunedTo=charId;castLogLine(p.c.name+': настройка на инфузированный предмет завершена за час.');});
}
function artificerAttuneOpen(charId,entryId){try{return artificerAttune(charId,entryId,arcanumPromptBool('Короткий отдых с этим предметом длился непрерывный час'));}catch(error){setStatus(error.message==='cancelled'?'Настройка отменена.':error.message,true);return false;}}
function artificerAttunementControls(c){return (c.inventory||[]).map(e=>{const row=artificerInfusionOf(c,e);return row?.definition.attunement&&!artificerEntryAttuned(c,e)?'<p>'+esc(row.definition.name)+' · '+esc(itemOf(e.itemId)?.n||'')+' <button class="btn" onclick="'+esc('artificerAttuneOpen('+JSON.stringify(c.id)+','+JSON.stringify(e.id)+')')+'">Настроиться · 1 час</button></p>':'';}).join('');}
function artificerFeaturesHTML(c){
 const p=globalThis.DndArtificerRules.profile(c),attunement=artificerAttunementControls(c);if(!p)return attunement;const state=artificerInfusionState(c),id=String(c.id).replace(/[^a-zA-Z0-9_-]/g,''),focus=artificerSpellFocus(c);
 let h='<section class="spell-learning-profile"><h3>Мастерская изобретателя</h3><p>Фокусировка: '+esc(focus?.label||'не в руке')+'. Инструменты или собственный предмет с инфузией нужны для каждого заклинания; дорогие и расходуемые компоненты учитываются отдельно.</p><button class="btn" onclick="artificerFocusOpen(\''+id+'\')">Взять фокусировку</button>';
 if(p.infusionsKnown){h+='<p>Известные инфузии: '+(state?.known||[]).map(key=>esc(globalThis.DndArtificerRules.infusionDefinition(key,c.level)?.name||key)).join(', ')+'. Активно '+(state?.active.length||0)+' из '+p.infusedItems+'.</p>';
  h+=(state?.active||[]).map(row=>{const held=artificerEntryRows().find(r=>r.entry.id===row.itemId),def=globalThis.DndArtificerRules.infusionDefinition(row.infusionId,c.level);return '<div>'+esc(def.name)+' → '+esc(held?.item.n||'предмет отсутствует')+(def.attunement?(held?.entry.att?' · настроено':' · нужна настройка'):'')+'</div>';}).join('');
  h+='<button class="btn" onclick="artificerInfusionsOpen(\''+id+'\')"'+(!state?.restReady||state.restToken!==artificerRestToken(c)||combat.active?' disabled':'')+'>Распределить после отдыха</button>';
 }
 h+='<p>Магическое мастерство: '+(c.artificer?.tinkering?.active.length||0)+' из '+p.tinkeringLimit+' предметов.</p><button class="btn" onclick="artificerTinkerOpen(\''+id+'\')">Придать свойство · действие</button>';
 for(const row of c.artificer?.tinkering?.active||[])h+='<div>'+esc(itemOf(artificerEntryRows().find(r=>r.entry.id===row.itemId)?.entry.itemId)?.n||row.itemId)+' · '+esc(row.kind==='light'?'свет':row.text)+' <button class="btn" onclick="artificerTinkerDismiss(\''+id+'\',\''+String(row.itemId).replace(/[^a-zA-Z0-9_-]/g,'')+'\')">Снять · действие</button></div>';
 if(p.rightTool)h+='<p>Нужный инструмент: час непрерывной работы; прежний созданный набор исчезает.</p><button class="btn" onclick="artificerRightToolOpen(\''+id+'\')">Создать инструменты · 1 час</button>';
 const training=artificerCantripTraining(c);if(training?.credits)h+='<p>Замены заговоров при повышении: '+training.credits+'.</p><button class="btn" onclick="artificerCantripReplaceOpen('+esc(JSON.stringify(c.id))+')">Заменить один заговор</button>';
 return h+attunement+'</section>';
}
function artificerCantripTraining(c){
 if(!c)return null;const saved=c.artificer?.cantripTraining;if(!saved)return {highestLevel:c.level,credits:0,revision:0};
 return Number.isInteger(saved.highestLevel)&&saved.highestLevel>=1&&saved.highestLevel<=20&&Number.isInteger(saved.credits)&&saved.credits>=0&&saved.credits<=19&&Number.isInteger(saved.revision)&&saved.revision>=0?saved:null;
}
function artificerCantripLevel(c,oldLevel){
 if(!globalThis.DndArtificerRules.profile(c))return;const existing=artificerCantripTraining(c);if(!existing)return;
 const previous=c.artificer?.cantripTraining?existing.highestLevel:(Number.isInteger(oldLevel)&&oldLevel>=1?oldLevel:c.level),gained=Math.max(0,c.level-previous);
 c.artificer=c.artificer||{};c.artificer.cantripTraining={highestLevel:Math.max(previous,c.level),credits:existing.credits+gained,revision:existing.revision+(gained?1:0)};
}
function artificerReplaceableCantrips(c){return (c.spellbook||[]).filter(e=>{const sp=spellOf(e.spellId);return sp&&+sp.l===0&&spellEntryCountsAgainstKnown(e)&&spellClassListHas(c,sp)&&['known','classList'].includes(e.access);});}
function artificerCantripReplace(charId,oldSpellId,newSpellId){
 const token=()=>{const c=getCh(charId);return JSON.stringify([c?.cls,c?.level,c?.spellbook,c?.artificer?.cantripTraining,spellOf(oldSpellId),spellOf(newSpellId)]);},initial=token();
 const prepare=()=>{const c=getCh(charId),state=artificerCantripTraining(c);if(!c||!globalThis.DndArtificerRules.profile(c)||!state||state.credits<1||initial!==token())return {ok:false,reason:'Нет доступной замены за повышение или выбор уже изменился.'};
  if(combat.active)return {ok:false,reason:'Закончите бой перед выбором за повышение уровня.'};const old=artificerReplaceableCantrips(c).find(e=>e.spellId===oldSpellId),sp=spellOf(newSpellId);
  if(!old||!sp||+sp.l!==0||!spellClassListHas(c,sp)||c.spellbook.some(e=>e.spellId===newSpellId))return {ok:false,reason:'Выберите один обычный изученный заговор и другой заговор изобретателя.'};return {ok:true,c,state,old,sp};};
 return arcanumAction('artificer-cantrip-replace:'+charId,prepare,p=>{const at=p.c.spellbook.indexOf(p.old);p.c.spellbook.splice(at,1,{spellId:p.sp.id,access:'known',prep:true,source:'Изобретатель'});p.c.artificer=p.c.artificer||{};p.c.artificer.cantripTraining={...p.state,credits:p.state.credits-1,revision:p.state.revision+1};castLogLine(p.c.name+': заменён заговор за повышение уровня — '+p.sp.n+'.');});
}
function artificerCantripReplaceOpen(charId){
 const c=getCh(charId);if(!c)return false;try{const oldId=arcanumChoose('Какой изученный заговор заменить?',artificerReplaceableCantrips(c).map(e=>({value:e.spellId,label:spellOf(e.spellId).n}))),newId=arcanumChoose('Новый заговор изобретателя',spellsDB.filter(sp=>+sp.l===0&&spellClassListHas(c,sp)&&!(c.spellbook||[]).some(e=>e.spellId===sp.id)).map(sp=>({value:sp.id,label:sp.n})));return artificerCantripReplace(charId,oldId,newId);}catch(error){setStatus(error.message==='cancelled'?'Выбор отменён; заговор и право замены сохранены.':error.message,true);return false;}
}
function artificerMovementModes(c,defaultSpeed){
 const number=value=>{const match=String(value??'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return match?Math.max(0,+match[0]):0;},speed=String(speedTotal(c)),walking=/ходьба\s+([\d,.]+)/i.exec(speed),walk=walking?number(walking[1]):defaultSpeed;
 const result={walk};if(conditionForcesZeroSpeed(effectiveConditions(c))||c.exhaustion>=5)return {walk:0};
 const multiplier=holderFxRules(c,'speed').filter(f=>f.mode==='mul').reduce((value,f)=>value*(Number.isFinite(+f.value)?+f.value:1),1);
 for(const [mode,stat] of [['fly','speed.fly'],['swim','speed.swim'],['climb','speed.climb']]){const values=holderFxRules(c,stat).filter(f=>f.mode==='set');if(!values.length)continue;const raw=values[values.length-1].value;result[mode]=/равна скорости ходьбы/i.test(String(raw))?walk:Math.max(0,number(raw)*multiplier);}
 return result;
}
function artificerMovementSpeed(key,defaultSpeed){
 if(!String(key).startsWith('ally:'))return defaultSpeed;const c=getCh(String(key).slice(5));if(!c)return defaultSpeed;
 const mode=c.artificerMovementMode;if(!mode)return defaultSpeed;const modes=artificerMovementModes(c,defaultSpeed);return modes[mode]??modes.walk;
}
function artificerMovementSet(key,mode){
 const stamp=arcanumTurnStamp(),prepare=()=>{const c=String(key).startsWith('ally:')?getCh(String(key).slice(5)):null;if(!c||stamp!==arcanumTurnStamp())return {ok:false,reason:'Ход или герой изменились.'};
  if(combat.active&&!combatCanSpendPure('turnfree',key))return {ok:false,reason:'Способ движения выбирается в свой ход.'};
  const speed=String(speedTotal(c)),match=speed.replace(',','.').match(/\d+(?:\.\d+)?/),modes=artificerMovementModes(c,match?+match[0]:0);if(!Object.hasOwn(modes,mode))return {ok:false,reason:'Этот способ движения больше недоступен.'};
  if(combat.active&&combat.turn?.actorKey===key&&combat.turn.movementUsed>modes[mode]*(combat.turn.dash?2:1))return {ok:false,reason:'На этот способ движения уже не осталось скорости: ранее пройденное расстояние тоже учитывается.'};return {ok:true,c};};
 return arcanumAction('artificer-movement:'+key,prepare,p=>{p.c.artificerMovementMode=mode;castLogLine(p.c.name+': '+({walk:'ходьба',fly:'полёт',swim:'плавание',climb:'лазание'}[mode]));});
}
function artificerMovementControls(c){
 const speed=String(speedTotal(c)),match=speed.replace(',','.').match(/\d+(?:\.\d+)?/),modes=artificerMovementModes(c,match?+match[0]:0);if(Object.keys(modes).length<2)return '';
 const selected=c.artificerMovementMode||Object.entries(modes).reduce((a,b)=>b[1]>a[1]?b:a,['walk',0])[0],labels={walk:'Ходьба',fly:'Полёт',swim:'Плавание',climb:'Лазание'};
 return '<label>Способ движения <select aria-label="Способ движения" onchange="artificerMovementSet('+esc(JSON.stringify('ally:'+c.id))+',this.value)">'+Object.entries(modes).map(([mode,value])=>'<option value="'+mode+'"'+(selected===mode?' selected':'')+'>'+labels[mode]+' · '+value+' м</option>').join('')+'</select></label>';
}

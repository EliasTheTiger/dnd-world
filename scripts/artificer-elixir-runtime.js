/* Experimental Elixir, Tasha 2020. Physical dice enter through askRolls.
 * Every mutation runs inside the common durable, rollback-capable action kernel. */
function artificerElixirState(c){
 const old=c?.artificer?.elixirs;
 return old&&typeof old==='object'?old:{rest:0,available:globalThis.DndArtificerRules.profile(c)?.freeElixirs||0};
}
function artificerElixirRestToken(c){const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;return JSON.stringify([c.cls,c.subcls,c.level,c.hp,stable(c.slots),stable(c.magicResource),fxRound]);}
function artificerElixirTemplates(){
 return globalThis.DndArtificerRules.elixirs.map(row=>({id:'it_artificer_elixir_'+row.id,n:'Экспериментальный эликсир: '+row.name,type:'equipment',rarity:'обычный',weight:'0,5 кг',cost:'—',tags:['artificer','elixir'],desc:'Создан алхимиком. Выпить — действие; напоить можно только бессознательное существо рядом. Исчезает в конце следующего долгого отдыха создателя. Управление находится в способностях владельца.',custom:true}));
}
function artificerElixirFlasks(c){return (c.inventory||[]).filter(e=>!e.artificerElixir&&e.qty>0&&(e.itemId==='it_starter_empty_flask'||e.artificerEmptyFlask===true));}
function artificerElixirHasSupplies(c){return (c.inventory||[]).some(e=>e.qty>0&&(e.itemId==='it_tool_alchemist'||/^(?:инструменты алхимика|набор алхимика|alchemist.?s? supplies)$/i.test(artificerToolName(itemOf(e.itemId)))));}
function artificerElixirActorCheck(c){
 if(!c)return {ok:false,reason:'Персонаж не найден.'};
 const blocked=ACTION_BLOCK_CONDS.find(x=>effectiveConditions(c).includes(x));
 if(c.hp<=0||blocked)return {ok:false,reason:'Состояние персонажа не позволяет действовать.'};
 if(combat.active&&!combatCanSpendPure('action','ally:'+c.id))return {ok:false,reason:'Нужно свободное действие текущего хода.'};
 return {ok:true};
}
function artificerElixirCreatePlan(c,input){
 const check=artificerElixirActorCheck(c);if(!check.ok)return check;
 const state=artificerElixirState(c);
 if(input.source==='rest'&&combat.active)return {ok:false,reason:'Эликсир отдыха создаётся при завершении отдыха, вне боя.'};
 if(input.source==='rest'&&state.restToken&&state.restToken!==artificerElixirRestToken(c))return {ok:false,reason:'После завершения отдыха уже начались другие события. Бесплатный эликсир создаётся только в конце отдыха.'};
 const payment=input.source==='slot'?(magicUsesMp()?magicPlan(c,input.slotLevel):{ok:!!(c.slots?.[input.slotLevel]?.cur>0),mode:'slot',lv:input.slotLevel,reason:'Нет доступной ячейки.'}):{ok:true,mode:'none'};
 if(!payment.ok)return payment;
 const flasks=artificerElixirFlasks(c),plan=globalThis.DndArtificerRules.elixirPlan(c,Object.assign({},input,{hasSupplies:artificerElixirHasSupplies(c),restAvailable:state.available,emptyFlasks:flasks.reduce((n,e)=>n+e.qty,0),availableSlots:payment.ok?1:0}));
 if(!plan.ok)return plan;
 const changes=[];let count=plan.cost.flasks;for(const e of flasks){const qty=Math.min(count,e.qty);if(qty)changes.push({entryId:e.id,qty});count-=qty;if(!count)break;}
 const guard=bg3InventoryMutationGuard(c,changes,{context:'experimental-elixir'});if(!guard.ok)return guard;
 return Object.assign(plan,{flasks:changes,rest:state.rest,payment});
}
function artificerElixirCreate(casterId,input){
 const stamp=arcanumTurnStamp(),token=JSON.stringify(getCh(casterId)?.artificer?.elixirs||null);
 const prepare=()=>{const c=getCh(casterId);if(arcanumTurnStamp()!==stamp||JSON.stringify(c?.artificer?.elixirs||null)!==token)return {ok:false,reason:'Отдых или ход изменился; повторите действие.'};return artificerElixirCreatePlan(c,input);};
 return arcanumAction('elixir-create:'+casterId+':'+fxUid(),prepare,plan=>{
  const c=getCh(casterId);if(plan.cost.action&&combat.active&&!combatSpend('action','Создание эликсира','ally:'+c.id))throw Error('Действие недоступно.');
  if(plan.cost.slots)commitSlotPlan(c,plan.payment);
  for(const change of plan.flasks){const entry=invEntryOf(c,change.entryId);entry.qty-=change.qty;if(!entry.qty){c.inventory=c.inventory.filter(e=>e!==entry);for(const slot of Object.keys(c.equipment||{}))if(c.equipment[slot]===entry.id)delete c.equipment[slot];}}
  c.artificer=c.artificer||{};c.artificer.elixirs=Object.assign({},artificerElixirState(c),{available:artificerElixirState(c).available-plan.cost.restUses});
  for(const elixir of plan.elixirs)c.inventory.push({id:'elixir_'+fxUid(),itemId:'it_artificer_elixir_'+elixir.kind,qty:1,artificerElixir:Object.assign(elixir,{rest:plan.rest})});
  castLogLine(c.name+': созданы эликсиры — '+plan.elixirs.map(e=>e.name).join(', '));
 });
}
function artificerElixirUsePlan(ownerId,entryId,targetKey,input={}){
 const owner=getCh(ownerId),entry=owner&&invEntryOf(owner,entryId),elixir=entry?.artificerElixir,ti=targetInfoOf(targetKey),check=artificerElixirActorCheck(owner);
 if(!check.ok)return check;if(!entry||entry.qty!==1||!elixir||!ti.obj)return {ok:false,reason:'Эликсир или цель больше недоступны.'};
 if(ti.obj.hp<=0&&(ti.kind==='foe'||(ti.obj.deaths?.f||0)>=3))return {ok:false,reason:'Эликсир не действует на погибшее существо.'};
 const creator=getCh(elixir.creatorId);if(!creator||artificerElixirState(creator).rest!==elixir.rest)return {ok:false,reason:'Срок действия эликсира истёк.'};
 const guard=bg3InventoryMutationGuard(owner,[{entryId,qty:1}],{context:'experimental-elixir-drink'});if(!guard.ok)return guard;
 const self=ti.kind==='ally'&&ti.id===owner.id,unconscious=(ti.kind==='foe'?effectiveFoeConditions(ti.obj):effectiveConditions(ti.obj)).includes('Бессознательный')||ti.obj.hp<=0;
 const snapshot=Object.assign({},creator,{cls:'Изобретатель',subcls:'Алхимик',level:elixir.creatorLevel,ab:Object.assign({},creator.ab,{int:10+2*elixir.intelligenceModifier})});
 const plan=globalThis.DndArtificerRules.elixirUsePlan(snapshot,elixir,Object.assign({},input,{self,targetUnconscious:unconscious}));
 if(!plan.ok)return plan;
 return Object.assign(plan,{owner,entry,elixir,ti});
}
function artificerElixirEffects(plan){
 const fx=[];const e=plan.effects;
 if(e.walkingSpeedBonus)fx.push({stat:'speed',mode:'add',value:e.walkingSpeedBonus,unit:'м'});
 if(e.armorClassBonus)fx.push({stat:'ac',mode:'add',value:e.armorClassBonus});
 if(e.attackBonusDice)fx.push({stat:'attack',mode:'die',value:e.attackBonusDice});
 if(e.savingThrowBonusDice)fx.push({stat:'save',mode:'die',value:e.savingThrowBonusDice});
 if(e.flyingSpeed)fx.push({stat:'speed.fly',mode:'set',value:e.flyingSpeed+' м'},{stat:'note',mode:'text',value:'Полёт '+e.flyingSpeed+' м; скорость ходьбы сохраняется.'});
 if(e.waterBreathing)fx.push({stat:'breathing.water',mode:'set',value:1},{stat:'speed.swim',mode:'set',value:'равна скорости ходьбы'},{stat:'note',mode:'text',value:'Можно дышать под водой; скорость плавания равна скорости ходьбы.'});
 if(e.alterSelf==='appearance')fx.push({stat:'note',mode:'text',value:'Изменённая внешность: прежние размер и строение тела; характеристики не меняются.'});
 if(e.naturalWeapon)fx.push({stat:'artificer.naturalWeapon',mode:'grant',value:e.naturalWeapon});
 return fx;
}
function artificerElixirEmptyBottle(holder){holder.inventory=holder.inventory||[];const existing=artificerElixirFlasks(holder)[0];if(existing)existing.qty++;else holder.inventory.push({id:'flask_'+fxUid(),itemId:'it_starter_empty_flask',qty:1,artificerEmptyFlask:true});}
function artificerElixirUse(ownerId,entryId,targetKey,input={}){
 const stamp=arcanumTurnStamp(),token=JSON.stringify(getCh(ownerId)&&invEntryOf(getCh(ownerId),entryId));
 const prepare=()=>{if(stamp!==arcanumTurnStamp()||JSON.stringify(getCh(ownerId)&&invEntryOf(getCh(ownerId),entryId))!==token)return {ok:false,reason:'Эликсир или ход изменились.'};return artificerElixirUsePlan(ownerId,entryId,targetKey,input);};
 return arcanumAction('elixir-use:'+entryId,prepare,plan=>{
  if(combat.active&&!combatSpend('action','Эликсир: '+plan.name,'ally:'+ownerId))throw Error('Действие недоступно.');
  plan.owner.inventory=plan.owner.inventory.filter(e=>e.id!==entryId);Object.keys(plan.owner.equipment||{}).forEach(k=>{if(plan.owner.equipment[k]===entryId)plan.owner.equipment[k]=null;});artificerElixirEmptyBottle(plan.owner);
  applyRollsToTarget(targetKey,{healTotal:plan.healing,tempTotal:plan.tempHp},'Эликсир: '+plan.name);
  if(plan.durationSeconds){const fx=artificerElixirEffects(plan),effect={k:'use',id:plan.entry.itemId,label:'Эликсир: '+plan.name,from:plan.owner.name,casterId:plan.elixir.creatorId,stackKey:plan.stackKey,artificerElixirEffect:plan.kind,artificerTransformation:plan.effects.alterSelf||null,expiresAtRound:fxRound+plan.durationSeconds/6,durationKind:'rounds',durationLabel:plan.durationSeconds/60+' мин.',fx};
   if(plan.ti.kind==='ally')applyFxTo(plan.ti.id,effect);else applyFxToFoe(plan.ti.obj,effect);
  }
  castLogLine(plan.owner.name+' → '+plan.ti.name+': эликсир «'+plan.name+'»');
 });
}
function artificerElixirRest(c){
 const profile=globalThis.DndArtificerRules.profile(c);if(!profile?.alchemist&&!c.artificer?.elixirs)return;
 // Match the creator, including flasks passed to another hero.
 for(const holder of chars){for(const entry of (holder.inventory||[]).slice()){if(entry.artificerElixir?.creatorId!==c.id)continue;holder.inventory=holder.inventory.filter(e=>e!==entry);for(const slot of Object.keys(holder.equipment||{}))if(holder.equipment[slot]===entry.id)delete holder.equipment[slot];artificerElixirEmptyBottle(holder);}}
 c.artificer=c.artificer||{};c.artificer.elixirs={rest:artificerElixirState(c).rest+1,available:profile?.freeElixirs||0};
}
function artificerElixirRestReady(c){if(c.artificer?.elixirs)c.artificer.elixirs.restToken=artificerElixirRestToken(c);}
function artificerElixirCreateOpen(casterId,source){
 const c=getCh(casterId);if(!c)return false;
 try{if(source==='rest')return askRolls({title:'Экспериментальный эликсир после отдыха',note:'Бросьте к6. Вид эликсира определяется результатом; используется один пустой флакон.',rows:[{key:'kind',label:'Результат к6',min:1,max:6}],compute:v=>globalThis.DndArtificerRules.elixirDefinition(v.kind)?.name||'',apply:v=>artificerElixirCreate(casterId,{source:'rest',rolls:[v.kind]})});
  const kind=arcanumChoose('Какой эликсир создать',globalThis.DndArtificerRules.elixirs.map(e=>({label:e.name,value:e.id}))),levels=magicUsesMp()?Array.from({length:maxCircleFor(c)},(_,i)=>i+1).filter(l=>magicPlan(c,l).ok).map(l=>({label:l+' круг — '+magicPlan(c,l).cost+' MP',value:l})):Object.entries(c.slots||{}).filter(([,s])=>s.cur>0).map(([l,s])=>({label:l+' круг — осталось '+s.cur,value:l})),slotLevel=+arcanumChoose(magicUsesMp()?'Круг и расход MP':'Потратить ячейку',levels);
  return artificerElixirCreate(casterId,{source:'slot',kind,slotLevel});
 }catch(error){setStatus(error.message,true);return false;}
}
function artificerElixirUseOpen(ownerId,entryId){
 const owner=getCh(ownerId),entry=owner&&invEntryOf(owner,entryId),elixir=entry?.artificerElixir;if(!elixir)return false;
 try{const targetKey=arcanumChoose('Кто выпивает эликсир', [{label:owner.name+' — выпить самому',value:'ally:'+ownerId}].concat(chars.filter(c=>c.id!==ownerId&&(c.hp<=0||effectiveConditions(c).includes('Бессознательный'))).map(c=>({label:c.name+' — напоить бессознательного',value:'ally:'+c.id})))),input={withinTouch:targetKey==='ally:'+ownerId||arcanumPromptBool('Бессознательный персонаж находится в пределах касания')};
  if(elixir.kind==='transformation'){input.transformationChoice=arcanumChoose('Вид преображения',[{label:'Водная адаптация',value:'aquatic'},{label:'Изменение внешности',value:'appearance'},{label:'Природное оружие',value:'natural-weapons'}]);if(input.transformationChoice==='natural-weapons')input.naturalWeaponDamage=arcanumChoose('Урон природного оружия',[{label:'Дробящий',value:'bludgeoning'},{label:'Колющий',value:'piercing'},{label:'Рубящий',value:'slashing'}]);}
  const rows=[];if(elixir.kind==='healing')for(let i=0;i<2;i++)rows.push({key:'heal'+i,label:'Лечение: к4 №'+(i+1),min:1,max:4});if(elixir.creatorLevel>=9)for(let i=0;i<2;i++)rows.push({key:'temp'+i,label:'Временные хиты: к6 №'+(i+1),min:1,max:6});
  const apply=values=>artificerElixirUse(ownerId,entryId,targetKey,Object.assign(input,{healingDice:[values.heal0,values.heal1],tempHpDice:[values.temp0,values.temp1]}));
  return rows.length?askRolls({title:'Эликсир: '+elixir.name,note:'Кости бросаете вы. Эликсир и действие расходуются только после подтверждения.',rows,apply}):apply({});
 }catch(error){setStatus(error.message,true);return false;}
}
function artificerElixirControls(c){
 const profile=globalThis.DndArtificerRules.profile(c),entries=(c.inventory||[]).filter(e=>e.artificerElixir),transformation=(c.activeFx||[]).find(e=>e.artificerElixirEffect==='transformation'&&e.expiresAtRound>fxRound);if(!profile?.alchemist&&!entries.length&&!transformation)return '';
 const button=(label,call)=>'<button class="btn ghost sm" onclick="'+esc(call)+'">'+esc(label)+'</button>';
 let h='<section class="panel"><h3>Экспериментальные эликсиры</h3>';
 if(profile?.alchemist){h+='<p>После отдыха доступно: '+artificerElixirState(c).available+'. Пустых флаконов: '+artificerElixirFlasks(c).reduce((n,e)=>n+e.qty,0)+'. Эликсиры не требуют концентрации.</p>'+button('Ввести к6 после отдыха',"artificerElixirCreateOpen("+JSON.stringify(c.id)+",'rest')")+' '+button('Создать за ячейку',"artificerElixirCreateOpen("+JSON.stringify(c.id)+",'slot')");}
 for(const e of entries)h+='<p>'+esc(e.artificerElixir.name)+' · до следующего отдыха создателя '+button('Выпить / напоить',"artificerElixirUseOpen("+JSON.stringify(c.id)+','+JSON.stringify(e.id)+')')+'</p>';
 if(transformation)h+='<p>Преображение действует ещё '+Math.max(0,(transformation.expiresAtRound-fxRound)*6)+' сек. '+button('Сменить облик — действие',"artificerElixirTransformOpen("+JSON.stringify(c.id)+')')+'</p>';
 return h+'</section>';
}
function artificerElixirTransform(charId,input){
 const c=getCh(charId),entry=(c?.activeFx||[]).find(e=>e.artificerElixirEffect==='transformation'&&e.expiresAtRound>fxRound),uid=entry?.uid,stamp=arcanumTurnStamp();
 const prepare=()=>{const holder=getCh(charId),check=artificerElixirActorCheck(holder),effect=(holder?.activeFx||[]).find(e=>e.uid===uid&&e.expiresAtRound>fxRound);if(!check.ok)return check;if(!effect||stamp!==arcanumTurnStamp())return {ok:false,reason:'Преображение или ход изменились.'};
  const source={id:'alter-self',cls:'Изобретатель',subcls:'Алхимик',level:3,ab:{int:10}},plan=DndArtificerRules.elixirUsePlan(source,{creatorId:source.id,kind:'transformation'},Object.assign({},input,{self:true}));return plan.ok?{ok:true,holder,effect,plan}:plan;};
 return arcanumAction('elixir-transform:'+charId+':'+fxUid(),prepare,p=>{if(combat.active&&!combatSpend('action','Сменить преображение','ally:'+charId))throw Error('Действие недоступно.');p.effect.fx=artificerElixirEffects(p.plan);p.effect.artificerTransformation=p.plan.effects.alterSelf;castLogLine(p.holder.name+': преображение изменено; исходный срок действия сохраняется.');});
}
function artificerElixirTransformOpen(charId){
 try{const transformationChoice=arcanumChoose('Новый облик',[{label:'Водная адаптация',value:'aquatic'},{label:'Изменение внешности',value:'appearance'},{label:'Природное оружие',value:'natural-weapons'}]),input={transformationChoice};if(transformationChoice==='natural-weapons')input.naturalWeaponDamage=arcanumChoose('Урон природного оружия',[{label:'Дробящий',value:'bludgeoning'},{label:'Колющий',value:'piercing'},{label:'Рубящий',value:'slashing'}]);return artificerElixirTransform(charId,input);}catch(error){setStatus(error.message,true);return false;}
}
function artificerElixirAugmentUnarmed(c,spec){
 const weapon=holderFxRules(c,'artificer.naturalWeapon').map(f=>f.value).filter(Boolean).pop();if(!weapon)return spec;
 const damageType=dmgTypeCanon(({bludgeoning:'дробящий',piercing:'колющий',slashing:'рубящий'})[weapon.damageType]||weapon.damageType);
 const atk=spec.rows.find(r=>r.type==='atk'),dmg=spec.rows.find(r=>r.type==='dmg'&&!r.sourceUid);if(atk){atk.mod=eMod(c,'str')+PROF[c.level]+fxSum(c,'atk')+fxSum(c,'unarmed.atk')+weapon.attackBonus;atk.label='Природное оружие: d20';}
 if(dmg){delete dmg.fixed;delete dmg.abilityGameplayBonus;Object.assign(dmg,{cnt:1,sides:6,mod:eMod(c,'str')+fxSum(c,'dmg')+weapon.damageBonus,dmgType:damageType,hint:'Магический безоружный удар',label:'Природное оружие: 1d6 + Сила + 1'});}else spec.rows.push({key:'artificer_natural_damage',type:'dmg',side:'caster',cnt:1,sides:6,mod:eMod(c,'str')+fxSum(c,'dmg')+weapon.damageBonus,dmgType:damageType,required:true,requiredOnHit:true,label:'Природное оружие: 1d6 + Сила + 1'});
 spec.meta.dmgType=damageType;spec.meta.damageTags=Object.assign({},spec.meta.damageTags,{magical:true});return spec;
}

'use strict';
// SRD 2014 movement spells: measured scene facts and human-entered saves.
function artificerBasicCreatureKind(sp){
 if(!sp||sp.custom||sp.grimoire?.translation==='custom'||sp.mechanics?.origin==='editor'||sp.grimoire?.edition&&sp.grimoire.edition!=='2014'||sp.rulesetRef?.id==='dnd5e-2024-reference')return '';
 const english=sp.grimoire?.english||sp.open5e?.originalName||({sp_лечение_ран:'Cure Wounds',sp_лечащее_слово:'Healing Word',sp_уход_за_умирающим:'Spare the Dying',sp_ядовитые_брызги:'Poison Spray'})[sp.id];
 return ({'Cure Wounds':'cure','Healing Word':'word','Spare the Dying':'stabilize','Poison Spray':'spray'})[english]||'';
}
function artificerBasicCreaturePreflight(sp,caster,targets,input){
 const kind=artificerBasicCreatureKind(sp);if(!kind)return {ok:true,handled:false};
 for(const key of targets){
  const ti=targetInfoOf(key),target=ti.obj;if(!target||!['ally','foe'].includes(ti.kind))return {ok:false,reason:'Для «'+sp.n+'» нужно выбрать живое существо.'};
  const type=[target.creatureType,target.kind,target.race,...(target.tags||[])].join(' ').toLowerCase();
  if(kind!=='spray'&&/undead|нежить|construct|конструкт/.test(type))return {ok:false,reason:'«'+sp.n+'» не действует на нежить и конструктов.'};
  if(kind==='stabilize'&&(+target.hp!==0||+target.deaths?.f>=3||target.dead===true))return {ok:false,reason:'Стабилизировать можно живое существо ровно с 0 хитов.'};
  if(kind==='word'||kind==='spray'){
   const facts=spellSceneFactsFor(input,key),conditions=effectiveConditions(caster),fx=charFxAll(caster),distance=facts.distanceM==null?null:Number(facts.distanceM);
   const senses=globalThis.DND_ARCANUM_CORE.visionCapabilities(fx,distance,conditions),blindSight=distance!=null&&Number.isFinite(distance)&&!conditions.includes('Глухой')&&fx.some(f=>f.stat==='vision.blind'&&+f.value>=distance);
   const targetFx=ti.kind==='ally'?charFxAll(target):foeFxAll(target),targetConditions=ti.kind==='ally'?effectiveConditions(target):effectiveFoeConditions(target),revealed=targetFx.some(f=>f.stat==='visibility.revealed'&&f.mode==='set'&&+f.value);
   const seesInvisible=!conditions.includes('Ослепленный')&&(senses.seeInvisible||fx.some(f=>f.stat==='vision.invisible'&&f.value));
   if(conditions.includes('Ослепленный')&&!blindSight||targetConditions.includes('Невидимый')&&!revealed&&!blindSight&&!seesInvisible)return {ok:false,reason:'«'+sp.n+'» требует видеть цель; действующее состояние не позволяет её видеть.'};
  }
 }
 return {ok:true,handled:false};
}
function artificerBasicKind(sp){if(!sp||sp.custom||sp.grimoire?.edition!=='2014'||sp.grimoire?.translation==='custom'||sp.mechanics?.origin==='editor')return '';return {'Jump':'jump','Expeditious Retreat':'retreat','Grease':'grease'}[sp.grimoire.english]||'';}
function artificerBasicReconcile(sp){
 if(['word','spray'].includes(artificerBasicCreatureKind(sp))&&sp.mechanics?.spell)sp.mechanics.spell.range.requiresLineOfSight=true;
 const kind=artificerBasicKind(sp);if(!kind||sp.custom||sp.grimoire?.edition!=='2014'||sp.mechanics?.origin==='editor')return;
 const m={schemaVersion:GAME_MECHANICS_SCHEMA_VERSION,mode:'structured',origin:'explicit',activation:{cost:kind==='retreat'?'bonus':'action',ritual:false},target:{kind:kind==='jump'?'any':'self',base:1},components:inferComponents(sp),duration:{kind:'rounds',rounds:kind==='retreat'?100:10,label:sp.d,concentration:kind==='retreat'},resolution:normalizeResolutionContract({attack:null,save:null,contest:null,rolls:[],needsRoll:false},'spell'),effects:[],breakOn:[],special:'artificerBasic'};
 m.sourceHash=mechanicsSourceHash(sp,'spell');m.spell=compileSpellRule(sp,m);m.spell.input.requireCompleteRolls=false;m.spell.input.requireSceneFacts=false;m.spell.range.requiresMeasurement=false;m.spell.range.requiresLineOfSight=false;m.spell.range.requiresClearPath=false;m.spell.obstacles.requiresClearPath=false;if(kind!=='jump')m.spell.targeting.type='self';sp.mechanics=m;
}
function artificerBasicSave(target,dc,values){
 const spec=arcanumSaveSpec(target,{key:'dex',dc,magic:true},'Скользкий жир');if(!spec)throw Error('Не удалось определить спасбросок Ловкости.');
 if(!values||spec.rows.some(r=>!Number.isInteger(values[r.key])||values[r.key]<r.min||values[r.key]>r.max))throw Error('Введите все результаты спасброска Ловкости.');
 const total=spec.total(values);return {target,ok:!spec.save.autoFail&&total>=dc,total,dc,consume:spec.save.consumeTargetFx||[]};
}
function artificerBasicSaveInput(target,dc){const spec=arcanumSaveSpec(target,{key:'dex',dc,magic:true},'Скользкий жир');if(!spec)throw Error('Цель не найдена.');const v={};for(const row of spec.rows)v[row.key]=artificerSpellNumber(spec.ti.name+': '+row.label,row.min,row.max,true);return v;}
function artificerBasicCollectInput(sp,targets,input){
 const kind=artificerBasicKind(sp);if(!kind)return {ok:true,input};
 try{const c=getCh(castCtx?.casterId);if(!c)throw Error('Заклинатель не найден.');const a=input.artificerBasic={};
  if(kind==='jump'){a.touch=artificerSpellBool('Вы касаетесь выбранного существа');}
  if(kind==='grease'){
   a.zoneName=window.prompt('Место квадрата скользкого жира 10 × 10 футов (3 × 3 м):','');if(a.zoneName==null)throw Error('cancelled');
   a.distanceM=artificerSpellNumber('Расстояние до центра области, м',0,18.288);a.clearPath=artificerSpellBool('До области свободный путь; жир покрывает землю');a.members=[];a.values={};
   const holders=combat.active?combat.order.map(e=>combatActorByKey(combatEntryKey(e))).filter(Boolean):chars.concat(foesDB),raw=window.prompt('Все существа в квадрате на земле: номера через запятую (0 — область пуста).\n'+holders.map((h,i)=>(i+1)+'. '+(h.name||h.n)).join('\n'),'');if(raw==null)throw Error('cancelled');if(!raw.trim())throw Error('Выберите существ или введите 0 для пустой области.');
   const indices=raw.trim()==='0'?[]:raw.split(',').map(v=>Number(v.trim()));if(indices.some(n=>!Number.isInteger(n)||n<1||n>holders.length)||new Set(indices).size!==indices.length)throw Error('Нужны разные номера из списка.');
   for(const n of indices){const holder=holders[n-1],key=(chars.includes(holder)?'ally:':'foe:')+holder.id;a.members.push(key);a.values[key]=artificerBasicSaveInput(key,spellDC(c));}
   a.allIncluded=true;
  }return {ok:true,input};
 }catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Наложение отменено; ресурсы не потрачены.':error.message};}
}
function artificerBasicPreflight(sp,caster,targets,input){
 const healing=artificerBasicCreaturePreflight(sp,caster,targets,input);if(!healing.ok)return healing;
 const kind=artificerBasicKind(sp);if(!kind)return {ok:true,handled:false};
 try{const a=input?.artificerBasic;if(!a)throw Error('Подтвердите условия заклинания.');const plan={kind,input:mechanicsClone(a),outcomes:[]};
  if(kind==='jump'&&(targets.length!==1||!targetInfoOf(targets[0]).obj||a.touch!==true))throw Error('Нужно одно существо в пределах касания.');
  if(kind!=='jump'&&(targets.length!==1||targets[0]!=='ally:'+caster.id))throw Error('Выберите заклинателя: на нём хранится эффект сцены.');
  if(kind==='grease'){
   if(!String(a.zoneName||'').trim()||!Number.isFinite(a.distanceM)||a.distanceM<0||a.distanceM>18.288||a.clearPath!==true||a.allIncluded!==true||!Array.isArray(a.members)||new Set(a.members).size!==a.members.length)throw Error('Подтвердите область 10 × 10 футов, свободный путь и всех существ в ней.');
   plan.outcomes=a.members.map(key=>artificerBasicSave(key,spellDC(caster),a.values?.[key]));
  }return {ok:true,handled:true,plan};
 }catch(error){return {ok:false,reason:error.message};}
}
function artificerBasicApplySave(row){const holder=targetInfoOf(row.target).obj;if(!holder)throw Error('Цель спасброска пропала.');arcanumConsumeSaveFx(holder,row.consume);if(!row.ok)combatApplyConditionDirect(row.target,'Сбитый с ног','Скользкий жир');castLogLine(targetInfoOf(row.target).name+': Скользкий жир — '+(row.total==null?'автоматический провал':row.total+' против СЛ '+row.dc)+'; '+(row.ok?'успех':'провал')+'.');}
function artificerBasicCommitCast(enginePlan,sp,caster,castId){
 const p=enginePlan.artificerBasic.plan,kind=p.kind,source='ally:'+caster.id,target=kind==='jump'?enginePlan.targets[0]:source,fx=kind==='jump'?[{stat:'jump.multiplier',mode:'set',value:3}]:[];
 const entry=artificerSpellEffect(target,sp,caster,castId,fx,{expiresAtRound:fxRound+(kind==='retreat'?100:10)});
 entry.artificerBasic={kind,...p.input,dc:spellDC(caster),receipts:{}};delete entry.artificerSpell;
 if(kind==='grease')entry.stackKey='grease-zone:'+castId;
 if(kind==='retreat'&&combat.active)combatGrantDash();
 for(const row of p.outcomes)artificerBasicApplySave(row);
 lastCastEvent={castId,casterId:caster.id,spellId:sp.id,usedSlotLvl:enginePlan.usedSlotLvl,round:fxRound,targets:enginePlan.targets.slice(),outcomeNotes:[]};
 recipeTabletopSpellTrigger(caster,sp);castLogLine(caster.name+': «'+sp.n+'» применено.');artificerSpellRefresh();
}
function artificerBasicEntries(){return chars.concat(foesDB).flatMap(holder=>(holder.activeFx||[]).filter(e=>e.artificerBasic&&!arcanumSuppressed(holder,e)&&(e.expiresAtRound==null||e.expiresAtRound>fxRound)).map(entry=>({holder,entry})));}
function combatGrantDash(){if(!combat.turn)return;combat.turn.dashCount=(Number.isInteger(combat.turn.dashCount)?combat.turn.dashCount:combat.turn.dash?1:0)+1;combat.turn.dash=true;}
async function artificerBasicDash(key){
 const stamp=arcanumTurnStamp(),prepare=()=>{const found=artificerBasicEntries().find(x=>x.holder===combatActorByKey(key)&&x.entry.artificerBasic.kind==='retreat');return combat.active&&arcanumTurnStamp()===stamp&&found&&combatCanSpendPure('bonus',key)?{ok:true}:{ok:false,reason:'Нужны действующее «Поспешное отступление» и свободное бонусное действие своего хода.'};};
 return arcanumAction('expeditious-dash:'+stamp,prepare,()=>{if(!combatSpend('bonus','Рывок — Поспешное отступление',key))throw Error('Бонусное действие недоступно.');combatGrantDash();});
}
function artificerBasicInGrease(holder){const key=(chars.includes(holder)?'ally:':'foe:')+holder?.id;return artificerBasicEntries().some(x=>x.entry.artificerBasic.kind==='grease'&&x.entry.artificerBasic.members.includes(key));}
function artificerBasicTurnEnd(actorKey){
 try{const plans=[],stamp=arcanumTurnStamp();for(const {entry} of artificerBasicEntries()){
  const a=entry.artificerBasic;if(a.kind!=='grease'||a.receipts?.[stamp+':'+actorKey])continue;
  const inside=artificerSpellBool(combatActorName(actorKey)+' заканчивает ход на земле в области «'+a.zoneName+'»');
  plans.push({entry,inside,receipt:stamp+':'+actorKey,save:inside?artificerBasicSave(actorKey,a.dc,artificerBasicSaveInput(actorKey,a.dc)):null});
 }for(const p of plans){const a=p.entry.artificerBasic;a.members=a.members.filter(k=>k!==actorKey);if(p.inside)a.members.push(actorKey);if(p.save)artificerBasicApplySave(p.save);a.receipts=a.receipts||{};a.receipts[p.receipt]=true;}if(plans.length)fxInvalidate();return true;
 }catch(error){setStatus(error.message==='cancelled'?'Ход не завершён: введите спасбросок от скользкого жира.':error.message,true);return false;}
}
async function artificerBasicZoneEvent(uid,target,enter,values){
 const stamp=arcanumTurnStamp(),prepare=()=>{const found=artificerBasicEntries().find(x=>x.entry.uid===uid&&x.entry.artificerBasic.kind==='grease');if(!found||!targetInfoOf(target).obj||stamp!==arcanumTurnStamp())return {ok:false,reason:'Область, цель или ход изменились.'};if(typeof enter!=='boolean'||found.entry.artificerBasic.members.includes(target)===enter)return {ok:false,reason:enter?'Существо уже находится в области. Сначала отметьте выход.':'Существо уже находится вне области.'};try{return {ok:true,entry:found.entry,save:enter?artificerBasicSave(target,found.entry.artificerBasic.dc,values):null};}catch(e){return {ok:false,reason:e.message};}};
 return arcanumAction('grease-contact:'+uid+':'+target,prepare,p=>{const a=p.entry.artificerBasic;a.members=a.members.filter(k=>k!==target);if(enter)a.members.push(target);if(p.save)artificerBasicApplySave(p.save);});
}
function artificerBasicZoneOpen(uid,enter){try{const entry=artificerBasicEntries().find(x=>x.entry.uid===uid)?.entry;if(!entry)throw Error('Область уже закончилась.');const target=artificerSpellChoose(enter?'Существо входит в жир на земле':'Существо покидает область',chars.concat(foesDB).map(h=>({label:h.name||h.n,value:(chars.includes(h)?'ally:':'foe:')+h.id}))),values=enter?artificerBasicSaveInput(target,entry.artificerBasic.dc):{};return artificerBasicZoneEvent(uid,target,enter,values);}catch(error){setStatus(error.message==='cancelled'?'Отменено; состояние не изменено.':error.message,true);return false;}}
function artificerBasicControls(holder){
 const buttons=[],key=(chars.includes(holder)?'ally:':'foe:')+holder.id;for(const {holder:owner,entry} of artificerBasicEntries()){if(owner!==holder)continue;const a=entry.artificerBasic;
 if(a.kind==='retreat')buttons.push('<button class="btn ghost sm" onclick="artificerBasicDash('+esc(JSON.stringify(key))+')">Рывок — бонусное действие</button>');
 if(a.kind==='grease')buttons.push('<span class="hint">'+esc(a.zoneName)+' · 10 × 10 футов · труднопроходимая земля</span>'+[true,false].map(enter=>'<button class="btn ghost sm" onclick="artificerBasicZoneOpen('+esc(JSON.stringify(entry.uid))+','+enter+')">'+(enter?'Войти в скользкий жир':'Покинуть скользкий жир')+'</button>').join(''));
 }return buttons.join('');
}

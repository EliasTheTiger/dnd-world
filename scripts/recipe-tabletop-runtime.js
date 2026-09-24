'use strict';
const recipeTabletopCommittedPlans=new WeakSet();
function recipeTabletopDialog(){const d=document.createElement('dialog');d.className='recipe-dialog';return d;}
// Campaign-native mechanics for the forty reviewed recipe items. All die
// inputs use the same human-roll interface as spells and ordinary weapons.
function recipeTabletopProfile(item){return globalThis.DND_RECIPE_TABLETOP_RULES?.profiles[item?.recipeTabletop||item?.mechanics?.recipeTabletop]||null;}
function recipeTabletopFlag(holder,stat){return holderFxRules(holder,stat).some(f=>f.value!==0&&f.value!==false);}
function recipeTabletopImmune(holder,type){const t=dmgTypeCanon(type),defense=foesDB.includes(holder)?foeDefensesOf(holder):null;return (defense?.immunities||holder.immune||[]).map(dmgTypeCanon).includes(t)||(defense?.damageRules||holder.damageRules||[]).concat(holderFxRules(holder,'damage.rule').map(f=>f.value)).some(r=>r?.mode==='immune'&&!r.when&&(r.types||[]).map(dmgTypeCanon).includes(t));}
function recipeTabletopInterruptSleep(holder,effects){if((effects||[]).some(f=>f.stat==='condition'&&canonicalCondition(f.value)==='Сбитый с ног'))holder.activeFx=(holder.activeFx||[]).filter(e=>!e.recipeAngelic);}
function recipeTabletopProtectedFx(holder,entry,effects){
 if(!recipeTabletopFlag(holder,'movement.freedom')||!(entry.k==='spell'||itemOf(entry.id)?.mechanics?.profile?.flags?.magical))return effects;
 return effects.filter(f=>!(f.stat==='condition'&&['Парализованный','Опутанный'].includes(canonicalCondition(f.value)))&&!(f.stat==='speed'&&(f.mode==='set'&&Number.parseFloat(f.value)<Number.parseFloat(holder.speed)||f.mode==='mul'&&+f.value<1||f.mode==='add'&&+f.value<0))&&!(f.stat==='speed.multiplier'&&+f.value<1));
}
function recipeTabletopCleanse(holder,names){const clear=new Set(names.map(canonicalCondition));if(clear.has('Отравленный'))holder.activeFx=(holder.activeFx||[]).filter(e=>!(e.recipeHit&&(e.fx||[]).some(f=>f.stat==='condition'&&canonicalCondition(f.value)==='Отравленный')));}
function recipeTabletopEffectEnded(holder,entry){if(!entry.recipeSunflash||entry.recipeAfterFlash)return;const caster=getCh(entry.casterId),it=itemOf(entry.id);if(caster&&it)recipeTabletopEffect(caster,it,(foesDB.includes(holder)?'foe:':'ally:')+holder.id,'afterFlash',{effects:[{stat:'attack',mode:'die',value:'-1d4'}],duration:{kind:'targetEnd',label:'до конца следующего хода'}},{recipeAfterFlash:true});}
function recipeTabletopEntries(holder){return (holder?.activeFx||[]).filter(e=>e.recipeRule||e.recipeHit);}
function recipeTabletopHeld(c){const ids=new Set(Object.values(c?.equipment||{}));return (c?.inventory||[]).filter(e=>ids.has(e.id)).map(e=>({entry:e,item:itemOf(e.itemId)})).filter(x=>recipeTabletopProfile(x.item));}
function recipeTabletopEffect(caster,item,target,rule,hit,extra={}){
 const ti=typeof target==='string'?targetInfoOf(target):target;if(!ti?.obj)return null;
 const poisoned=(hit.effects||[]).some(f=>f.stat==='condition'&&f.value==='Отравленный');
 if(poisoned&&(holderConditionImmune(ti.obj,'Отравленный')||recipeTabletopImmune(ti.obj,'яд')))return null;
 if(hit.fireConversion&&(recipeTabletopImmune(ti.obj,'огонь')||!bg3DamageTraitEffectiveResistance(ti.obj,'огонь',{})))return null;
 const prior=recipeTabletopEntries(ti.obj).find(e=>e.recipeHit===rule),effects=itemClone(hit.effects||[]);
 ti.obj.activeFx=(ti.obj.activeFx||[]).filter(e=>e.recipeHit!==rule);
 const use={id:rule,label:item.n,effects,duration:hit.duration||{kind:'rounds',rounds:2,label:'2 раунда'},stackKey:'recipe:'+rule};
 const entry=applyItemUseEntry(caster,item,use,ti,{recipeHit:rule,recipeRule:rule,recipeTick:hit.tick||null,recipeRepeatSave:hit.repeatSave?hit.save:null,recipeSunflash:!!hit.sunflash,...extra});
 if(hit.repeatSave&&entry)entry.repeatSave={when:'end',key:hit.save.key,dc:hit.save.dc};
 if(entry&&hit.frost&&prior)recipeTabletopEffect(caster,item,ti,'frozen',{effects:[{stat:'condition',mode:'text',value:'Опутанный'}],duration:{kind:'targetEnd',label:'до конца следующего хода'}});
 return entry;
}
function recipeTabletopPreflight(c,e,it,use,opts){
 if(!use?.recipeRule)return {ok:true};
 const rule=use.recipeRule,p=recipeTabletopProfile(it);
 if(!p||!p.actions.some(a=>a.id===use.id))return {ok:false,reason:'Правило предмета изменилось. Откройте карточку заново.'};
 if(/^angelic/.test(rule)&&holderEffectImmune(c,'magicalSleep'))return {ok:false,reason:'Герой невосприимчив к магическому сну; зелье не расходуется.'};
 if(use.recipeBurst)return {ok:false,reason:'Выберите всех существ в области через действие броска гранаты.'};
 if(use.recipeSurface)return {ok:false,reason:'Выберите конкретный предмет для нанесения контактного яда.'};
 if(use.recipeCooldown&&e.recipeCooldowns?.[use.id])return {ok:false,reason:'Это применение восстановится после '+(use.recipeCooldown==='short'?'короткого':'продолжительного')+' отдыха.'};
 if(/^meditation/.test(rule)&&c.recipeMeditationSpent)return {ok:false,reason:'Дополнительная ячейка уже потрачена; она восстановится после продолжительного отдыха.'};
 if(rule==='harpoonReady'&&e.recipeCooldowns?.harpoon)return {ok:false,reason:'Гарпун восстановится после короткого отдыха.'};
 if(rule==='lightningReady'&&e.recipeCooldowns?.lightning)return {ok:false,reason:'Молниевый выстрел восстановится после продолжительного отдыха.'};
 if(['harpoonReady','lightningReady'].includes(rule)&&e.recipeShot)return {ok:false,reason:'Особый выстрел уже подготовлен. Выполните его или отмените подготовку.'};
 return {ok:true};
}
function recipeTabletopApply(c,it,use,ti,rolls,opts){
 const p=recipeTabletopProfile(it),rule=use.recipeRule,e=invEntryOf(c,opts.entryId);
 if(!p||!rule)return '';
 if(use.effects?.length){const stack=use.stackKey||'use:'+it.id+':'+use.id;ti.obj.activeFx=(ti.obj.activeFx||[]).filter(x=>x.stackKey!==stack);}
 if(use.recipeCooldown){e.recipeCooldowns=e.recipeCooldowns||{};e.recipeCooldowns[use.id]=use.recipeCooldown;}
 if(use.recipeCoating){
  const weapon=invEntryOf(c,opts.weaponEntryId),wi=weapon&&itemOf(weapon.itemId);if(!weapon||!wi)throw Error('Покрываемое оружие исчезло после проверки.');
  c.activeFx=(c.activeFx||[]).filter(x=>!(x.weaponEntryId===weapon.id&&(x.recipeCoating||x.itemTrigger==='basicPoison'||x.bg3Status)));
  c.activeFx.push({uid:fxUid(),k:'use',id:it.id,label:it.n+' — '+wi.n,recipeRule:rule,recipeCoating:rule,weaponEntryId:weapon.id,recipeShots:itemProfile(wi).weapon?.ammo?(p.coating.singleExposure?1:3):null,
    fx:[],appliedRound:fxRound,durationKind:p.coating.singleExposure?'manual':'rounds',...(p.coating.singleExposure?{}:{expiresAtRound:fxRound+10}),durationLabel:p.coating.singleExposure?'до ранения или смывания':'1 минута'});
  return ' · '+wi.n+' покрыто составом';
 }
 if(use.recipeExposure&&rolls?.saveOk===false)recipeTabletopEffect(c,it,ti,rule,p.exposure);
 if(rule==='shadow'){
  foesDB=foesDB.filter(f=>!(f.recipeShadow&&f.summonedBy===c.id));
  const shadow={id:'shadow_'+fxUid(),n:'Тень — '+c.name,name:'Тень',creatureType:'нежить',size:'Средний',ac:12,hp:16,hpMax:16,speed:'12 м',ab:{str:6,dex:14,con:13,int:6,wis:10,cha:8},
   resist:['кислота','огонь','холод','электричество','звук','дробящий','колющий','рубящий'],immune:['некротический','яд'],vuln:['излучение'],cond:[],activeFx:[],
   recipeShadow:true,summonedBy:c.id,summonedByCastId:castUid(),summonedExpiresAtRound:fxRound+600,
   actions:[{id:'touch',n:'Теневое касание',cost:'action',target:'creature',attack:{mode:'melee',bonus:4,reach:1.5},damage:[{cnt:2,sides:6,mod:2,type:'некротический'}],text:'Атака +4, досягаемость 1,5 м; 2d6+2 некротического урона.'}],
   traits:'Не проходит сквозь преграды; не создаёт новых теней. Слушается владельца фонаря.'};
  shadow.abil=shadow.ab;delete shadow.ab;shadow.combatActions=[{id:'touch',n:'Теневое касание',kind:'attack',cost:'attack',mode:'melee',attackBonus:4,range:'1,5 м',within5:true,damage:[{cnt:2,sides:6,mod:2,type:'некротическая энергия'}]}];shadow.actions='Теневое касание: +4, 2d6+2 некротической энергии.';shadow.movement={walk:12};shadow.condImmune=['Отравленный'];shadow.langs='понимает владельца';shadow.summonSide='ally';upgradeFoe(shadow);
  foesDB.push(shadow);
  if(combat.active){const owner=combatEntryByKey('ally:'+c.id);if(owner){combat.order=combat.order.filter(x=>x.kind!=='foe'||foeOf(x.id));const index=combat.order.findIndex(x=>x===owner);combat.order.splice(index+1,0,{kind:'foe',id:shadow.id,initiative:owner.initiative,nat:owner.nat,mod:owner.mod,seq:owner.seq+0.5,reactionUsed:0});combat.snapshots['foe:'+shadow.id]=combatSnapshotOf(combat.order[index+1]);}}
  return ' · призвана тень (КД 12, 16 хитов, скорость 12 м); ход сразу после владельца';
 }
 if(rule==='harpoonReady'||rule==='lightningReady'){e.recipeShot=rule==='harpoonReady'?'harpoon':'lightning';return ' · следующий выстрел подготовлен';}
 if(rule==='alchemistFire'&&rolls?.hit===true)recipeTabletopEffect(c,it,ti,rule,{effects:[],duration:{kind:'manual',label:'пока не потушен'},tick:{cnt:1,sides:4,type:'огонь',mod:0}});
 if(rule==='hagBane'&&rolls?.hit===true&&/карг|hag/i.test([ti.obj.creatureType,ti.obj.n,ti.obj.race].join(' '))){
  const outcome=rolls.recipeResults?.find(r=>r.key==='hag');if(!outcome)throw Error('Нет спасброска карги.');
  if(!outcome.success){ti.obj.swallowed=[];ti.obj.swallowedTargets=[];itemLog(c,'Погибель карги: проглоченное существо освобождено рядом с целью.');}
 }
 return '';
}
function recipeTabletopAppliedEntry(c,it,use,entry){
 if(!entry||!use?.recipeRule)return;
 entry.recipeRule=use.recipeRule;
 if(/^meditation/.test(use.recipeRule))entry.recipeSlot={level:Number(use.recipeRule.slice(10)),available:true};
 if(use.recipeRule==='angelicGreater'||use.recipeRule==='angelicLesser')entry.recipeAngelic=use.recipeRule==='angelicGreater'?2:1;
 if(use.recipeRule==='acuity')entry.recipeAcuity=3;
}
function recipeTabletopSpellTrigger(c,rec){
 if(!recipeTabletopFlag(c,'recipe.tadpole')||!(/Прориц|Очарован|divination|enchantment/i.test([rec.school,rec.sc,rec.s].join(' '))||(rec.tags||[]).some(t=>/psionic|псиони/i.test(t))))return;
 c.activeFx=(c.activeFx||[]).filter(x=>x.recipeHit!=='psionicEmpowerment');
 const source=recipeTabletopEntries(c).find(e=>e.recipeRule==='tadpole'),it=source&&itemOf(source.id);if(it)recipeTabletopEffect(c,it,'ally:'+c.id,'psionicEmpowerment',{effects:[{stat:'attack',mode:'adv',value:1}],duration:{kind:'rounds',rounds:3,label:'3 раунда'}});
}
function recipeTabletopHitRules(c,it,ti,kind,opts){
 const p=recipeTabletopProfile(it),rows=[];
 if(kind==='weapon'){
  if(p?.onHit)rows.push({key:'weapon',rule:p.stats,hit:p.onHit,item:it});
  for(const a of recipeTabletopEntries(c).filter(a=>a.recipeCoating&&a.weaponEntryId===opts?.entryId)){
   const source=itemOf(a.id),cp=recipeTabletopProfile(source);if(cp?.coating)rows.push({key:'coat',rule:a.recipeCoating,hit:cp.coating,item:source,coating:a.uid});
  }
  const e=invEntryOf(c,opts?.entryId);if(e?.recipeShot==='harpoon')rows.push({key:'harpoon',rule:'harpoon',item:it,hit:{save:{key:'str',dc:15},effects:[],pull:9,duration:{kind:'manual',label:'сразу'}}});
 }
 if(kind==='item'&&p?.actions.some(a=>a.id===opts?.use?.id)&&opts.use.recipeRule==='hagBane'&&/карг|hag/i.test([ti.obj?.creatureType,ti.obj?.n,ti.obj?.race].join(' ')))rows.push({key:'hag',rule:'hag',item:it,hit:{save:{key:'con',dc:15},effects:[]}});
 return rows;
}
function recipeTabletopAppendSave(spec,c,ti,row){
 const save=row.hit.save,key='recipe_'+row.key+'_save',known=ti.known&&typeof ti.saveMod==='function',fx=save?(ti.kind==='ally'?rollFxEntries(ti.obj,'save.'+save.key,row.hit.effects?.some(f=>f.value==='Отравленный')?['poison']:[]):holderFxEntries(ti.obj).filter(f=>f.stat==='save.'+save.key||f.stat==='save'||f.stat==='save.all')):[],
  mode=save?saveConditionMode(ti,save.key,{magic:!!row.item?.mechanics?.profile?.flags?.magical}):{},a=mode.adv||fx.some(f=>f.mode==='adv'),d=mode.dis||fx.some(f=>f.mode==='dis');
 const copy={key:row.key,rule:row.rule,itemId:row.item?.id,hit:itemClone(row.hit),coating:row.coating||null};
 if(save){
  copy.rowKey=key;copy.mod=(known?ti.saveMod(save.key):0)+fx.filter(f=>f.mode==='add'&&!['save.'+save.key,'save.all'].includes(f.stat)).reduce((n,f)=>n+(+f.value||0),0);copy.adv=a===d?0:a?1:2;copy.autoFail=mode.autoFail;
  copy.consumeTargetFx=[...new Set(fx.filter(f=>f.consume==='roll'&&f.sourceUid).map(f=>f.sourceUid))];
  spec.rows.push({key,type:'recipe',side:'target',natural:known,dc:save.dc,required:true,requiredOnHit:!!spec.rows.find(r=>r.type==='atk'),mod:copy.mod,adv:copy.adv,
   label:row.item.n+' — спасбросок '+(AB_FULL[save.key]||save.key),hint:'СЛ '+save.dc+'; отдельный бросок цели'});
  copy.dice=[];fx.filter(f=>f.mode==='die').forEach((f,i)=>{const m=String(f.value).match(/^(-)?(\d*)d(\d+)$/);if(!m)return;const k=key+'_bonus'+i;copy.dice.push({key:k,sign:m[1]?-1:1});spec.rows.push({key:k,type:'recipe',side:'target',cnt:+m[2]||1,sides:+m[3],required:true,requiredOnHit:!!spec.rows.find(r=>r.type==='atk'),label:'Эффект спасброска: '+f.value});});
 }
 if(row.hit.damage){const damage=row.hit.damage;copy.damageKey='recipe_'+row.key+'_damage';spec.rows.push({key:copy.damageKey,type:'recipe',side:'caster',cnt:damage.cnt,sides:damage.sides,required:true,requiredOnHit:true,label:row.item.n+': '+damage.cnt+'d'+damage.sides+' '+damage.type,hint:'При успешном спасброске этот урон не применяется'});}
 (spec.meta.recipeHits=spec.meta.recipeHits||[]).push(copy);
}
function recipeTabletopAugmentSpec(c,it,ti,spec,kind,opts={}){
 const p=recipeTabletopProfile(it);
 if(!p&&!recipeTabletopEntries(c).length&&!recipeTabletopHeld(c).some(x=>recipeTabletopProfile(x.item)?.coldStaff))return spec;
 spec.meta.recipeCasterId=c?.id;spec.meta.recipeEntryId=opts.entryId;
 recipeTabletopHitRules(c,it,ti,kind,opts).forEach(row=>recipeTabletopAppendSave(spec,c,ti,row));
 const addDamage=(key,d)=>spec.rows.push({key,type:'dmg',side:'caster',cnt:d.cnt,sides:d.sides,mod:d.mod||0,dmgType:d.type,required:true,requiredOnHit:!!spec.rows.find(r=>r.type==='atk'),label:(it?.n||'Эффект')+': '+d.cnt+'d'+d.sides+' '+d.type});
 if(kind==='weapon'||kind==='unarmed'){
  if(p?.extraDamage)addDamage('recipe_extra',p.extraDamage);
  if(p?.eyesDamage&&Number(ti.obj?.eyes)>=3)addDamage('recipe_eyes',p.eyesDamage);
  const die=holderFxRules(c,'recipe.weaponDie').map(f=>+f.value||0).reduce((a,b)=>a+b,0);
  if(die>0)addDamage('recipe_size',{cnt:1,sides:die,type:spec.meta.dmgType||it.dmgType});
  if(die<0){spec.rows.push({key:'recipe_reduce',type:'recipe',side:'caster',cnt:1,sides:-die,required:true,requiredOnHit:true,label:'Уменьшение урона: 1d'+(-die)});spec.meta.recipeReduce=true;}
  const coating=recipeTabletopEntries(c).find(a=>a.recipeCoating==='reduce'&&a.weaponEntryId===opts.entryId);
  if(coating){const attack=spec.rows.find(r=>r.type==='atk'),damage=spec.rows.find(r=>r.type==='dmg');if(attack)attack.mod--;if(damage)damage.mod--;}
  if(p?.crossbow&&recipeTabletopFlag(c,'recipe.crossbow')){const atk=spec.rows.find(r=>r.type==='atk');if(atk)atk.adv=atk.adv===2?0:1;}
  const e=invEntryOf(c,opts.entryId);if(e?.recipeShot==='lightning'){
   spec.rows=spec.rows.filter(r=>r.type!=='dmg');spec.rows.push({key:'recipe_lightning',type:'dmg',side:'caster',cnt:4,sides:8,mod:0,dmgType:'электричество',required:true,label:'Молниевый выстрел: 4d8',hint:'При промахе половина урона'});spec.meta.recipeLightning=true;
  }
 }
 if((kind==='spell'||kind==='item'&&opts.use?.recipeRule==='rayFrost')&&spec.rows.some(r=>r.type==='dmg'&&dmgTypeCanon(r.dmgType)==='холод')){
  const staff=recipeTabletopHeld(c).find(x=>recipeTabletopProfile(x.item)?.coldStaff);if(staff){
   spec.rows.find(r=>r.type==='dmg'&&dmgTypeCanon(r.dmgType)==='холод').mod=(+spec.rows.find(r=>r.type==='dmg'&&dmgTypeCanon(r.dmgType)==='холод').mod||0)+1;
   recipeTabletopAppendSave(spec,c,ti,{key:'cold',rule:'chilled',item:staff.item,hit:{save:{key:'con',dc:13},effects:[{stat:'damage.rule',mode:'grant',value:{mode:'vuln',types:['холод']}},{stat:'damage.rule',mode:'grant',value:{mode:'resist',types:['огонь']}}],duration:{kind:'rounds',rounds:2,label:'2 раунда'}}});
  }
 }
 return spec;
}
function recipeTabletopOutcome(spec,v,out){
 if(!spec.meta.recipeCasterId)return out;
 out.recipeCasterId=spec.meta.recipeCasterId;out.recipeEntryId=spec.meta.recipeEntryId;
 out.recipeResults=(spec.meta.recipeHits||[]).map(row=>{
  const value=row.rowKey?(row.autoFail?0:pickNat(v,row.rowKey,row.adv)):null,extras=(row.dice||[]).reduce((n,d)=>n+(Number(v[d.key])||0)*d.sign,0),total=value==null?null:value+row.mod+extras;
  return {...itemClone(row),total,success:row.hit.save?(total==null?null:total>=row.hit.save.dc):false,damage:row.damageKey?v[row.damageKey]:null};
 });
 if(spec.meta.recipeReduce&&out.hit===true&&Number.isFinite(v.recipe_reduce)&&out.damageParts[0]){
  const part=out.damageParts[0];part.raw=Math.max(0,part.raw-v.recipe_reduce);part.total=dmgAfterTraits(spec.meta.target.obj,part.raw,part.type,spec.meta.damageTags).amount;
  out.dmgTotal=out.damageParts.reduce((n,p)=>n+p.total,0);
 }
 if(spec.meta.recipeLightning){out.recipeLightning=true;const raw=Number(v.recipe_lightning);if(Number.isFinite(raw)&&out.hit!=null){const amount=out.hit?raw:Math.floor(raw/2),tr=dmgAfterTraits(spec.meta.target.obj,amount,'электричество',{magical:true});out.damageParts=[{raw:amount,total:tr.amount,type:'электричество'}];out.dmgRaw=amount;out.dmgTotal=tr.amount;out.dmgType='электричество';}}
 if(out.hit===true)for(const row of out.recipeResults){if(row.success!==false||row.damage==null||!row.hit.damage)continue;const raw=Number(row.damage),type=row.hit.damage.type,total=dmgAfterTraits(spec.meta.target.obj,raw,type,{magical:false}).amount;out.damageParts.push({raw,total,type});out.dmgRaw=(out.dmgRaw||0)+raw;out.dmgTotal=(out.dmgTotal||0)+total;}
 return out;
}
function recipeTabletopRollPreflight(c,it,target,rolls,kind,opts={}){
 const ti=targetInfoOf(target);if(!ti.obj)return {ok:false,reason:'Цель больше не существует.'};
 if(rolls?.hit===true||kind==='spell'&&rolls?.dmgTotal>0)for(const row of recipeTabletopHitRules(c,it,ti,kind,opts)){
  const result=rolls.recipeResults?.find(x=>x.key===row.key&&x.rule===row.rule);if(!result||row.hit.save&&typeof result.success!=='boolean')return {ok:false,reason:'Не введён отдельный спасбросок свойства «'+row.item.n+'».'};
 }
 return {ok:true};
}
function recipeTabletopConsequences(target,rolls,beforeHp){
 const c=getCh(rolls.recipeCasterId),ti=targetInfoOf(target);if(!c||!ti.obj)return;
 if((rolls.hit===true||rolls.hit==null&&rolls.dmgTotal>0)&&ti.kind==='ally')consumeRollFx(ti.obj,(rolls.recipeResults||[]).flatMap(row=>row.consumeTargetFx||[]));
 if(rolls.hit===true||rolls.hit==null&&rolls.dmgTotal>0)for(const row of rolls.recipeResults||[]){
  if(row.rule==='hag'||row.rule==='chilled'&&!(rolls.damageParts||[]).some(p=>dmgTypeCanon(p.type)==='холод'&&p.total>0)||row.hit.injury&&!(rolls.damageParts||[]).some(p=>['колющий','рубящий'].includes(dmgTypeCanon(p.type))&&p.total>0)||row.success!==false)continue;
  const item=itemOf(row.itemId);if(!item)continue;
  if(row.hit.pull){ti.obj.recipeMovement={toward:'ally:'+c.id,meters:row.hit.pull,round:fxRound};if(ti.obj.position&&c.position){const dx=c.position.x-ti.obj.position.x,dy=c.position.y-ti.obj.position.y,d=Math.hypot(dx,dy),m=Math.min(row.hit.pull,Math.max(0,d-1.5));if(d){ti.obj.position.x+=dx/d*m;ti.obj.position.y+=dy/d*m;ti.obj.recipeMovement.meters=m;}}itemLog(c,'Гарпун притягивает '+ti.name+' до '+ti.obj.recipeMovement.meters+' м; перемещение останавливается перед препятствием.');continue;}
  const entry=recipeTabletopEffect(c,item,ti,row.rule,row.hit);if(entry&&row.hit.sleepMargin&&row.total<=row.hit.save.dc-row.hit.sleepMargin){entry.fx.push({stat:'condition',mode:'text',value:'Бессознательный'});entry.recipePoisonSleep=true;}
 }
 if(rolls.attackMade&&rolls.recipeEntryId){
  const e=invEntryOf(c,rolls.recipeEntryId);
  for(const a of recipeTabletopEntries(c).filter(a=>a.recipeCoating&&a.weaponEntryId===rolls.recipeEntryId)){
   const coating=recipeTabletopProfile(itemOf(a.id))?.coating;
   if(coating?.singleExposure&&rolls.hit&&(rolls.damageParts||[]).some(p=>['колющий','рубящий'].includes(dmgTypeCanon(p.type))&&p.total>0))c.activeFx=c.activeFx.filter(x=>x!==a);
   else if(a.recipeShots!=null){a.recipeShots--;if(a.recipeShots<=0)c.activeFx=c.activeFx.filter(x=>x!==a);}
  }
  if(e?.recipeShot){e.recipeCooldowns=e.recipeCooldowns||{};e.recipeCooldowns[e.recipeShot]=e.recipeShot==='harpoon'?'short':'long';if(e.recipeShot==='lightning')recipeTabletopQueueBurst(c,itemOf(e.itemId),target,'lightning');delete e.recipeShot;}
 }
 if(beforeHp>0&&ti.obj.hp===0&&ti.kind==='foe'&&ti.obj.summonSide!=='ally'&&combat.active&&combatCurrentKey()==='ally:'+c.id&&recipeTabletopFlag(c,'recipe.bloodlust')&&!combat.turn.recipeBloodlust){
  combat.turn.recipeBloodlust=true;combat.turn.recipeExtraAttacks=(+combat.turn.recipeExtraAttacks||0)+1;applyTempHp('ally:'+c.id,5);itemLog(c,'Кровожадность: 5 временных хитов и одна дополнительная атака.');
 }
 fxInvalidate();
}
function recipeTabletopDamage(holder,amount,type){
 if(!(amount>0))return;
 for(const a of recipeTabletopEntries(holder)){
  if(a.recipePoisonSleep){a.fx=a.fx.filter(f=>!(f.stat==='condition'&&f.value==='Бессознательный'));delete a.recipePoisonSleep;}
  if(a.recipeAngelic)holder.activeFx=holder.activeFx.filter(x=>x!==a);
  if(a.recipeAcuity!=null){a.recipeAcuity=Math.max(0,a.recipeAcuity-2);a.fx.filter(f=>['spell.atk','spell.dc'].includes(f.stat)).forEach(f=>f.value=a.recipeAcuity);}
  if(dmgTypeCanon(type)==='огонь'&&['frost','frozen'].includes(a.recipeHit))holder.activeFx=holder.activeFx.filter(x=>x!==a);
  if(dmgTypeCanon(type)==='огонь'&&a.recipeHit==='combustion'){holder.activeFx=holder.activeFx.filter(x=>x!==a);const c=getCh(a.casterId);if(c)recipeTabletopQueueBurst(c,itemOf(a.id),(foesDB.includes(holder)?'foe:':'ally:')+holder.id,'combustion');}
 }
 fxInvalidate();
}
function recipeTabletopExpire(holder,entry){
 if(entry.recipeAngelic&&entry.expiresAtRound<=fxRound){
  const greater=entry.recipeAngelic===2;if(!recipeTabletopFlag(holder,'healing.block'))holder.hp=greater?eHpMax(holder):Math.min(eHpMax(holder),(+holder.hp||0)+Math.floor(eHpMax(holder)/2));
  refreshShortRestResources(holder);for(const [level,slot]of Object.entries(holder.slots||{}))if(greater||+level<=2)slot.cur=slot.max;
  if(greater){holder.hdUsed=0;if(holder.magicResource)MAGIC_RULES.rest(holder);(holder.abilities||[]).forEach(e=>{const a=abilityOf(e.abilityId);if(a?.uses!=null)e.cur=abilityMaxUses(holder,a);});rechargeItems(holder,'long');recipeTabletopRest(holder,'long');}
 }
}
function recipeTabletopRest(c,kind){
 for(const e of c.inventory||[])for(const [key,rest]of Object.entries(e.recipeCooldowns||{}))if(kind==='long'||rest==='short')delete e.recipeCooldowns[key];
 if(kind==='long'){delete c.recipeMeditationSpent;for(const a of recipeTabletopEntries(c))if(a.recipeSlot)a.recipeSlot.available=false;}
}
function recipeTabletopSlot(c,level){return recipeTabletopEntries(c).find(e=>e.recipeSlot?.available&&e.recipeSlot.level>=level&&!c.recipeMeditationSpent);}
function recipeTabletopStartTurn(key){
 const ti=targetInfoOf(key);if(!ti.obj)return;
 for(const e of recipeTabletopEntries(ti.obj)){
  if(e.recipeAcuity!=null){e.recipeAcuity=3;e.fx.filter(f=>['spell.atk','spell.dc'].includes(f.stat)).forEach(f=>f.value=3);}
  if(e.recipeTick){ti.obj.recipePendingTicks=ti.obj.recipePendingTicks||[];ti.obj.recipePendingTicks.push({id:fxUid(),label:e.label,damage:itemClone(e.recipeTick),round:fxRound});}
 }
 recipeTabletopSyncHaste();
 fxInvalidate();
}
function recipeTabletopSyncHaste(){
 if(!combat.active||!combat.turn)return;
 const holder=combatActorByKey(combatCurrentKey()),turn=combat.turn;if(!holder)return;
 const active=recipeTabletopFlag(holder,'recipe.haste');
 if(active&&!turn.recipeHasteAvailable&&!turn.recipeHasteSpent){turn.recipeHasteAvailable=true;turn.recipeHasteSpent=false;turn.recipeExtraAttacks=(+turn.recipeExtraAttacks||0)+1;}
 if(!active&&turn.recipeHasteAvailable){turn.recipeHasteAvailable=false;turn.recipeExtraAttacks=Math.max(0,(+turn.recipeExtraAttacks||0)-1);}
}
function recipeTabletopQueueBurst(c,it,target,kind){
 c.recipePendingBursts=c.recipePendingBursts||[];c.recipePendingBursts.push({id:fxUid(),itemId:it.id,target,kind});
 itemLog(c,(kind==='combustion'?'Воспламенение':'Молниевый разряд')+': выберите существ в пределах 3 м и введите броски.');
}
function recipeTabletopBurstSave(c,it,ti,burst){const spec={rows:[],meta:{}};recipeTabletopAppendSave(spec,c,ti,{key:'burst',rule:'burst',item:it,hit:{...burst,damage:null}});return {spec,rule:spec.meta.recipeHits[0]};}
function recipeTabletopRepeatSaveOpen(key,row,next){
 const ti=targetInfoOf(key),it=itemOf(row.entry.id),c=getCh(row.entry.casterId);if(!it||!c){next();return true;}
 const {spec,rule}=recipeTabletopBurstSave(c,it,ti,{save:row.rule,effects:row.entry.fx}),rows=spec.rows.flatMap(r=>[{key:r.key,label:r.label,min:r.cnt||1,max:r.sides?r.cnt*r.sides:20},...(r.adv?[{key:r.key+'_2',label:'Второй d20 ('+(r.adv===1?'преимущество':'помеха')+')',min:1,max:20}]:[])]);
 const total=v=>pickNat(v,rule.rowKey,rule.adv)+rule.mod+rule.dice.reduce((n,d)=>n+v[d.key]*d.sign,0);
 if(rule.autoFail){next();return true;}
 askRolls({title:'Повторный спасбросок — '+ti.name,note:row.entry.label+'; СЛ '+row.rule.dc,rows,compute:v=>total(v)+' против СЛ '+row.rule.dc,apply:v=>{
  if(!(ti.obj.activeFx||[]).includes(row.entry)){next();return;}
  const ok=total(v)>=row.rule.dc;if(ok){ti.obj.activeFx=ti.obj.activeFx.filter(e=>e!==row.entry);recipeTabletopEffectEnded(ti.obj,row.entry);}
  if(ti.kind==='ally')consumeRollFx(ti.obj,rule.consumeTargetFx||[]);combatLog(ti.name+': '+row.entry.label+' — '+total(v)+' против СЛ '+row.rule.dc+'; '+(ok?'эффект снят':'эффект продолжается'),'change',key);fxInvalidate();scheduleSave();renderChars();renderFoes();next();
 }});return true;
}
function recipeTabletopSurface(c,sourceId,targetId){
 const source=invEntryOf(c,sourceId),target=invEntryOf(c,targetId),it=source&&itemOf(source.itemId),use=it&&itemUseOf(it,'crawlersurface');
 if(!source||!target||source===target||!use||+target.qty!==1||target.recipeContactPoison)return {ok:false,reason:'Выберите один отдельный предмет без уже нанесённой дозы.'};
 const check=canUseItemCheck(c,source,it,{...use,recipeSurface:null},'ally:'+c.id,{});if(!check.ok)return check;
 if(combat.active&&!combatCanSpendPure(use.cost,'ally:'+c.id))return {ok:false,reason:'Для нанесения нужно действие в свой ход.'};
 if(combat.active&&!combatSpend(use.cost,it.n,'ally:'+c.id))return {ok:false,reason:'Действие уже потрачено.'};commitItemUseResource(check.resource);
 target.recipeContactPoison={itemId:it.id,casterId:c.id};fxInvalidate();scheduleSave();renderChars();return {ok:true};
}
function recipeTabletopContact(c,entryId,targetKey,values,washed=false){
 const entry=invEntryOf(c,entryId),dose=entry?.recipeContactPoison,ti=targetInfoOf(targetKey),it=dose&&itemOf(dose.itemId);if(!dose||!it)return false;
 if(washed){delete entry.recipeContactPoison;scheduleSave();renderChars();return true;}
 if(!ti.obj)return false;const hit=recipeTabletopProfile(it).exposure,{spec,rule}=recipeTabletopBurstSave(c,it,ti,hit);
 for(const row of spec.rows){const v=values?.[row.key];if(!Number.isInteger(v)||v<(row.cnt||1)||v>(row.sides?row.cnt*row.sides:20)||row.adv&&(!Number.isInteger(values[row.key+'_2'])||values[row.key+'_2']<1||values[row.key+'_2']>20))return false;}
 const total=pickNat(values,rule.rowKey,rule.adv)+rule.mod+rule.dice.reduce((n,d)=>n+values[d.key]*d.sign,0);delete entry.recipeContactPoison;
 if(rule.autoFail||total<hit.save.dc)recipeTabletopEffect(getCh(dose.casterId)||c,it,ti,'crawler',hit);
 if(ti.kind==='ally')consumeRollFx(ti.obj,rule.consumeTargetFx||[]);fxInvalidate();scheduleSave();renderChars();renderFoes();return true;
}
function recipeTabletopSurfaceOpen(entryId,casterId){const c=getCh(casterId);if(!c)return false;const d=recipeTabletopDialog();d.innerHTML='<form method="dialog"><h3>Контактный яд</h3><p>Выберите единичный предмет. Доза останется на нём до касания голой кожи или смывания. Стопку сначала разделите в инвентаре.</p><select id="rs-item">'+c.inventory.filter(e=>e.id!==entryId&&+e.qty===1&&!e.recipeContactPoison).map(e=>'<option value="'+esc(e.id)+'">'+esc(itemOf(e.itemId)?.n||e.itemId)+'</option>').join('')+'</select><p id="rs-error" role="alert"></p><button id="rs-apply" type="button" class="btn rub">Нанести дозу</button><button value="cancel">Отмена</button></form>';document.body.append(d);d.querySelector('#rs-apply').onclick=()=>{const r=recipeTabletopSurface(c,entryId,d.querySelector('#rs-item').value);if(r.ok)d.close();else d.querySelector('#rs-error').textContent=r.reason;};d.addEventListener('close',()=>d.remove());d.showModal();return true;}
function recipeTabletopContactOpen(id,entryId){const c=getCh(id),entry=c&&invEntryOf(c,entryId),it=entry?.recipeContactPoison&&itemOf(entry.recipeContactPoison.itemId);if(!it)return;const d=recipeTabletopDialog();d.innerHTML='<form method="dialog"><h3>Контакт голой кожи с ядом</h3><p>Выберите существо, уже коснувшееся отравленного предмета. Попадание оружием само по себе не означает такого контакта.</p><select id="rc-target">'+chars.map(x=>'<option value="ally:'+esc(x.id)+'">'+esc(x.name)+'</option>').concat(foesDB.map(x=>'<option value="foe:'+esc(x.id)+'">'+esc(x.n)+'</option>')).join('')+'</select><button id="rc-confirm" type="button" class="btn rub">Контакт произошёл — спасбросок</button><button value="cancel">Отмена</button></form>';document.body.append(d);d.querySelector('#rc-confirm').onclick=()=>{const key=d.querySelector('#rc-target').value,{spec}=recipeTabletopBurstSave(c,it,targetInfoOf(key),recipeTabletopProfile(it).exposure);d.close();const rows=spec.rows.flatMap(r=>[{key:r.key,label:r.label,min:r.cnt||1,max:r.sides?r.cnt*r.sides:20},...(r.adv?[{key:r.key+'_2',label:'Второй d20 ('+(r.adv===1?'преимущество':'помеха')+')',min:1,max:20}]:[])]);askRolls({title:it.n,rows,compute:()=> 'Телосложение СЛ 13',apply:v=>recipeTabletopContact(c,entryId,key,v)});};d.addEventListener('close',()=>d.remove());d.showModal();}
function recipeTabletopBurstPlan(c,entryId,useId,selection,pendingId){
 const pending=pendingId&&(c.recipePendingBursts||[]).find(x=>x.id===pendingId),entry=entryId&&invEntryOf(c,entryId),it=itemOf(pending?.itemId||entry?.itemId),p=recipeTabletopProfile(it),use=entry&&itemUseOf(it,useId);
 if(!it||!pending&&!use?.recipeBurst)return {ok:false,reason:'Предмет или ожидающий разряд больше недоступен.'};
 if(!pending){const check=canUseItemCheck(c,entry,it,{...use,recipeBurst:null},'ally:'+c.id,{});if(!check.ok)return check;}
 const burst=pending?{radius:3,range:0,save:{key:'dex',dc:pending.kind==='lightning'?15:13},damage:{cnt:pending.kind==='lightning'?2:3,sides:pending.kind==='lightning'?8:6,type:pending.kind==='lightning'?'электричество':'огонь'}}:p.burst;
 if(!selection?.confirmed||!Array.isArray(selection.targets)||!Number.isFinite(selection.distance)||selection.distance<0||!pending&&selection.distance>burst.range)return {ok:false,reason:'Подтвердите точку броска, расстояние и полный список существ в области.'};
 if(new Set(selection.targets.map(t=>t.key)).size!==selection.targets.length)return {ok:false,reason:'Одна цель указана дважды.'};
 const targets=[];for(const selected of selection.targets){const ti=targetInfoOf(selected.key);if(!ti.obj||!Number.isFinite(selected.distance)||selected.distance<0||selected.distance>burst.radius)return {ok:false,reason:'Цель находится вне выбранной области: '+burst.radius+' м от центра'+(burst.shape==='cube'?' по каждой оси':'')+'.'};
 let success=false;
 if(burst.save){const {spec,rule}=recipeTabletopBurstSave(c,it,ti,burst),values={...selected.dice,[rule.rowKey]:selected.save,[rule.rowKey+'_2']:selected.save2};
  for(const row of spec.rows){const value=values[row.key];if(!Number.isInteger(value)||value<(row.cnt||1)||value>(row.sides?row.cnt*row.sides:20)||row.adv&&(!Number.isInteger(values[row.key+'_2'])||values[row.key+'_2']<1||values[row.key+'_2']>20))return {ok:false,reason:ti.name+': внесите все реальные кости — '+row.label+'.'};}
  const total=pickNat(values,rule.rowKey,rule.adv)+rule.mod+rule.dice.reduce((n,d)=>n+values[d.key]*d.sign,0);success=!rule.autoFail&&total>=burst.save.dc;
 }
 targets.push({ti,selected,success,consumeTargetFx:burst.save?recipeTabletopBurstSave(c,it,ti,burst).rule.consumeTargetFx:[]});
 }
 if(pending?.kind==='combustion'&&!targets.some(t=>t.selected.key===pending.target))return {ok:false,reason:'Взрыв включает существо, на котором воспламенилось масло.'};
 if(burst.damage&&(!Number.isInteger(selection.damage)||selection.damage<burst.damage.cnt||selection.damage>burst.damage.cnt*burst.damage.sides))return {ok:false,reason:'Введите один общий бросок урона в допустимых пределах.'};
 const resource=entry&&itemUseResourcePlan(c,entry,it,use);if(resource&&!resource.ok)return resource;
 if(!pending&&combat.active&&!combatCanSpendPure(use.cost,'ally:'+c.id))return {ok:false,reason:'Действие сейчас недоступно.'};
 return {ok:true,c,entry,it,use,pending,burst,selection:itemClone(selection),targets,resource};
}
function recipeTabletopBurstCommit(plan){
 if(!plan?.ok||recipeTabletopCommittedPlans.has(plan))return false;
 const fresh=recipeTabletopBurstPlan(plan.c,plan.entry?.id,plan.use?.id,plan.selection,plan.pending?.id);if(!fresh.ok){setStatus(fresh.reason,true);return false;}
 const snapshot=bg3InterruptWorldCheckpoint([]);
 try{
  if(fresh.pending)fresh.c.recipePendingBursts=fresh.c.recipePendingBursts.filter(x=>x.id!==fresh.pending.id);
  else {if(combat.active&&!combatSpend(fresh.use.cost,fresh.it.n,'ally:'+fresh.c.id))return false;commitItemUseResource(fresh.resource);}
  let zone=null;if(fresh.burst.haste){zone={id:'spores_'+fxUid(),recipeSporeZone:true,itemId:fresh.it.id,casterId:fresh.c.id,expiresAtRound:fxRound+3,radius:3,members:[]};combat.zones=combat.zones||[];combat.zones.push(zone);}
  for(const row of fresh.targets){
   if(row.ti.kind==='ally')consumeRollFx(row.ti.obj,row.consumeTargetFx||[]);
   if(fresh.burst.damage){const raw=row.success?Math.floor(fresh.selection.damage/2):fresh.selection.damage,type=fresh.burst.damage.type,damage=dmgAfterTraits(row.ti.obj,raw,type,{magical:true}).amount;applyDamageTo(row.selected.key,damage,type,fresh.it.n,{},row.ti);}
   else if(zone)recipeTabletopZoneMember(zone.id,row.selected.key,row.selected.distance);
   else if(!row.success){
    recipeTabletopEffect(fresh.c,fresh.it,row.ti,fresh.burst.rule||'sunflash',fresh.burst);
    if(fresh.burst.sunflash&&/construct|конструкт/i.test([row.ti.obj.creatureType,row.ti.obj.kind].join(' ')))recipeTabletopEffect(fresh.c,fresh.it,row.ti,'sunflash-stun',{effects:[{stat:'condition',mode:'text',value:'Ошеломлённый'}],duration:{kind:'targetEnd',label:'до конца следующего хода'}});
   }
  }
  recipeTabletopCommittedPlans.add(plan);fxInvalidate();scheduleSave();renderChars();renderFoes();renderCombat();return true;
 }catch(error){bg3InterruptWorldRestore(snapshot);setStatus('Действие отменено: '+error.message,true);return false;}
}
function recipeTabletopZoneMember(zoneId,key,distance){
 const z=(combat.zones||[]).find(z=>z.id===zoneId&&z.recipeSporeZone&&z.expiresAtRound>fxRound),ti=targetInfoOf(key);if(!z||!ti.obj||!Number.isFinite(distance)||distance<0)return false;
 ti.obj.activeFx=(ti.obj.activeFx||[]).filter(e=>e.recipeZone!==z.id);z.members=z.members.filter(k=>k!==key);
 if(distance<=3){const c=getCh(z.casterId),it=itemOf(z.itemId),p=recipeTabletopProfile(it);if(!c||!it)return false;const e=recipeTabletopEffect(c,it,ti,'hasteSpores',p.burst,{recipeZone:z.id});e.expiresAtRound=z.expiresAtRound;z.members.push(key);}
 fxInvalidate();recipeTabletopSyncHaste();scheduleSave();return true;
}
function recipeTabletopBurstOpen(entryId,casterId,useId,pendingId){
 const c=getCh(casterId);if(!c)return false;
 const pending=pendingId&&c.recipePendingBursts?.find(x=>x.id===pendingId),entry=entryId&&invEntryOf(c,entryId),it=itemOf(pending?.itemId||entry?.itemId);if(!it)return false;
 const burst=pending?{radius:3,save:{key:'dex',dc:pending.kind==='lightning'?15:13}}:recipeTabletopProfile(it).burst;
 document.getElementById('recipe-burst-dialog')?.remove();const dialog=recipeTabletopDialog();dialog.id='recipe-burst-dialog';
 const people=chars.map(x=>({key:'ally:'+x.id,name:x.name})).concat(foesDB.map(x=>({key:'foe:'+x.id,name:x.n}))).map(t=>({...t,save:burst.save?recipeTabletopBurstSave(c,it,targetInfoOf(t.key),burst):null}));
 const input=(i,key,label,min,max)=>'<label>'+esc(label)+' <input data-roll="'+i+':'+key+'" type="number" min="'+min+'" max="'+max+'"></label>';
 dialog.innerHTML='<form method="dialog"><h3>'+esc(it.n)+'</h3><p>'+ (burst.shape==='cube'?'Выберите всех существ в кубе со стороной 1,5 м. В поле положения укажите наибольшее расстояние от центра по одной из осей.':'Выберите всех существ в радиусе '+burst.radius+' м.')+' Внесите реальные кости каждой цели. Успех и последствия рассчитываются отдельно.</p>'+(pending?'':'<label>До точки броска, м <input id="recipe-burst-distance" type="number" min="0" step="0.1" value="0"></label>')
 +people.map((t,i)=>'<fieldset><legend><label><input type="checkbox" data-target="'+esc(t.key)+'"'+(pending?.target===t.key?' checked':'')+'>'+esc(t.name)+'</label></legend><label>Положение от центра, м <input data-distance="'+i+'" type="number" min="0" max="'+burst.radius+'" step="0.1" value="0"></label>'+ (t.save?t.save.spec.rows.map(r=>input(i,r.key,r.label+(r.natural?' '+fmtMod(r.mod)+'; СЛ '+burst.save.dc:''),r.cnt||1,r.sides?r.cnt*r.sides:20)+(r.adv?input(i,r.key+'_2','Второй d20: '+(r.adv===1?'преимущество':'помеха'),1,20):'')).join(''):'')+'</fieldset>').join('')
 +(pending?'<label>Общий урон '+(pending.kind==='lightning'?'2d8':'3d6')+' <input id="recipe-burst-damage" type="number"></label>':'')+'<p role="alert" id="recipe-burst-error"></p><button type="button" id="recipe-burst-apply" class="btn rub">Применить ко всем целям</button><button class="btn ghost" value="cancel">Отмена</button></form>';
 document.body.append(dialog);dialog.querySelector('#recipe-burst-apply').onclick=()=>{
  const targets=[];dialog.querySelectorAll('[data-target]').forEach((checkbox,i)=>{if(!checkbox.checked)return;const t=people[i],dice={};dialog.querySelectorAll('[data-roll]').forEach(input=>{if(input.dataset.roll.startsWith(i+':'))dice[input.dataset.roll.slice(String(i).length+1)]=input.value===''?null:Number(input.value);});targets.push({key:t.key,distance:Number(dialog.querySelector('[data-distance="'+i+'"]').value),save:t.save?dice[t.save.rule.rowKey]:null,save2:t.save?dice[t.save.rule.rowKey+'_2']:null,dice});});
  const plan=recipeTabletopBurstPlan(c,entryId,useId,{confirmed:true,distance:Number(dialog.querySelector('#recipe-burst-distance')?.value||0),targets,damage:Number(dialog.querySelector('#recipe-burst-damage')?.value)},pendingId);
  if(!plan.ok){dialog.querySelector('#recipe-burst-error').textContent=plan.reason;return;}if(recipeTabletopBurstCommit(plan))dialog.close();
 };dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();return true;
}
function recipeTabletopTickResolve(key,id,value){
 const ti=targetInfoOf(key),tick=ti.obj?.recipePendingTicks?.find(t=>t.id===id);if(!tick||!Number.isInteger(value)||value<tick.damage.cnt||value>tick.damage.cnt*tick.damage.sides)return false;
 ti.obj.recipePendingTicks=ti.obj.recipePendingTicks.filter(t=>t.id!==id);const d=dmgAfterTraits(ti.obj,value,tick.damage.type,{magical:true}).amount;applyDamageTo(key,d,tick.damage.type,tick.label,{},ti);fxInvalidate();scheduleSave();renderChars();renderFoes();renderCombat();return true;
}
function recipeTabletopTickOpen(key,id){const ti=targetInfoOf(key),tick=ti.obj?.recipePendingTicks?.find(t=>t.id===id);if(!tick)return false;askRolls({title:tick.label+' — начало хода',rows:[{key:'damage',label:tick.damage.cnt+'d'+tick.damage.sides,min:tick.damage.cnt,max:tick.damage.cnt*tick.damage.sides}],compute:v=>'Урон: '+v.damage,apply:v=>recipeTabletopTickResolve(key,id,v.damage)});return true;}
function recipeTabletopExtinguish(key,uid,value,inWater=false){
 const ti=targetInfoOf(key),entry=ti.obj?.activeFx?.find(x=>x.uid===uid&&x.recipeRule==='alchemistFire');if(!entry)return false;
 if(!inWater&&(!Number.isInteger(value)||value<1||value>20||combat.active&&!combatCanSpendPure('action',key)))return false;
 if(!inWater&&combat.active&&!combatSpend('action','Погасить пламя',key))return false;
 const mod=ti.kind==='ally'?eMod(ti.obj,'dex'):Math.floor(((ti.obj.abil?.dex||10)-10)/2);
 if(inWater||value+mod>=10)ti.obj.activeFx=ti.obj.activeFx.filter(x=>x!==entry);
 fxInvalidate();scheduleSave();renderChars();renderFoes();return true;
}
function recipeTabletopExtinguishOpen(key,uid){askRolls({title:'Погасить огонь — действие, Ловкость СЛ 10',rows:[{key:'d20',label:'Реальный d20',min:1,max:20}],compute:v=>'Бросок: '+v.d20,apply:v=>recipeTabletopExtinguish(key,uid,v.d20)});}
function recipeTabletopControls(holder,key){
 key=key||(foesDB.includes(holder)?'foe:':'ally:')+holder.id;let html='';
 const button=(label,fn)=>'<button class="btn ghost sm" onclick="'+esc(fn)+'">'+esc(label)+'</button>';
 if(holderFxRules(holder,'size.steps').length)html+='<span class="uses-box">Размер: '+esc(recipeTabletopSize(holder).name)+'</span>';
 if(holder.recipeMovement)html+='<span class="uses-box">Гарпун: перемещение к '+esc(combatActorName(holder.recipeMovement.toward))+' до '+holder.recipeMovement.meters+' м; препятствия ограничивают перемещение.</span>';
 for(const tick of holder.recipePendingTicks||[])html+=button(tick.label+' — урон начала хода',"recipeTabletopTickOpen('"+key+"','"+tick.id+"')");
 for(const p of holder.recipePendingBursts||[])html+=button(p.kind==='lightning'?'Молниевый разряд':'Взрыв масла',"recipeTabletopBurstOpen(null,'"+holder.id+"',null,'"+p.id+"')");
 for(const e of recipeTabletopEntries(holder)){
  if(e.recipeRule==='alchemistFire')html+=button('Погасить огонь',"recipeTabletopExtinguishOpen('"+key+"','"+e.uid+"')")+button('Погружение в воду',"recipeTabletopExtinguish('"+key+"','"+e.uid+"',null,true)");
  if(['animals','thoughts'].includes(e.recipeRule))html+=button(e.recipeRule==='animals'?'Говорить со зверем':'Читать мысли',"recipeTabletopConversationOpen('"+holder.id+"','"+e.uid+"')");
  if(e.recipeRule==='jump'||e.recipeRule==='freedom')html+=button('Перемещение и прыжки',"recipeTabletopMoveOpen('"+holder.id+"')");
  if(e.recipeRule==='freedom')html+=button('Освободиться из захвата',"recipeTabletopEscape('"+holder.id+"')");
  if(e.recipePoisonSleep||e.recipeAngelic)html+=button('Разбудить',"recipeTabletopWakeOpen('"+key+"','"+e.uid+"')");
 }
 for(const z of combat.zones||[])if(z.recipeSporeZone&&z.expiresAtRound>fxRound)html+=button('Положение относительно спор',"recipeTabletopZoneOpen('"+z.id+"','"+key+"')");
 for(const e of holder.inventory||[])if(e.recipeShot)html+=button('Отменить особый выстрел',"recipeTabletopCancelShot('"+holder.id+"','"+e.id+"')");
 for(const e of holder.inventory||[])if(e.recipeContactPoison)html+=button('Контакт с ядом: '+(itemOf(e.itemId)?.n||'предмет'),"recipeTabletopContactOpen('"+holder.id+"','"+e.id+"')")+button('Смыть контактный яд',"recipeTabletopContact(getCh('"+holder.id+"'),'"+e.id+"',null,null,true)");
 return html?'<div class="row-line recipe-effect-controls">'+html+'</div>':'';
}
function recipeTabletopCancelShot(id,entryId){const c=getCh(id),e=c&&invEntryOf(c,entryId);if(!e?.recipeShot)return false;delete e.recipeShot;scheduleSave();renderChars();renderCombat();return true;}
function recipeTabletopWake(target,uid,actorId,distance){const ti=targetInfoOf(target),actor=getCh(actorId),entry=ti.obj?.activeFx?.find(e=>e.uid===uid&&(e.recipePoisonSleep||e.recipeAngelic));if(!entry||!actor||actor===ti.obj||!Number.isFinite(distance)||distance<0||distance>1.5||!combatCanSpendPure('action','ally:'+actorId))return false;if(combat.active&&!combatSpend('action','Разбудить '+ti.name,'ally:'+actorId))return false;if(entry.recipeAngelic)ti.obj.activeFx=ti.obj.activeFx.filter(e=>e!==entry);else{entry.fx=entry.fx.filter(f=>!(f.stat==='condition'&&canonicalCondition(f.value)==='Бессознательный'));delete entry.recipePoisonSleep;}fxInvalidate();scheduleSave();renderChars();renderFoes();return true;}
function recipeTabletopWakeOpen(key,uid){const actorId=combat.active&&combatFocusedKey().startsWith('ally:')?combatFocusedKey().slice(5):activeCharId;askRolls({title:'Разбудить — действие выбранного героя',note:'Нужен другой дееспособный герой в пределах касания.',rows:[{key:'distance',label:'Фактическая дистанция, м',min:0,max:1.5}],compute:v=>'Дистанция '+v.distance+' м',apply:v=>recipeTabletopWake(key,uid,actorId,v.distance)});}
function recipeTabletopZoneOpen(zoneId,key){askRolls({title:'Облако спор — положение существа',rows:[{key:'distance',label:'Фактическая дистанция от центра, м',min:0,max:1000}],compute:v=>v.distance<=3?'Внутри облака':'Вне облака',apply:v=>{recipeTabletopZoneMember(zoneId,key,v.distance);renderChars();renderFoes();renderCombat();}});}
function recipeTabletopTimeCheck(steps){
 const holders=chars.concat(foesDB);if(holders.some(h=>h.recipePendingTicks?.length||h.recipePendingBursts?.length))return {ok:false,reason:'Сначала завершите ожидающий урон начала хода или взрыв.'};
 if(!combat.active&&steps>1&&holders.some(h=>recipeTabletopEntries(h).some(e=>e.recipeTick)))return {ok:false,reason:'Пока действует горение или периодический яд, переходите по одному раунду и вносите урон.'};
 return {ok:true};
}
function recipeTabletopAdvanceTime(){if(combat.active)return;for(const h of chars.concat(foesDB))for(const e of recipeTabletopEntries(h))if(e.recipeTick){h.recipePendingTicks=h.recipePendingTicks||[];h.recipePendingTicks.push({id:fxUid(),label:e.label,damage:itemClone(e.recipeTick),round:fxRound});}}
function recipeTabletopFormatEffect(f){const names={'size.steps':'категория размера','carry.multiplier':'грузоподъёмность ×','speed.multiplier':'скорость ×','jump.multiplier':'дальность прыжка ×','recipe.weaponDie':'добавочная кость оружия','communication.beasts':'общение со зверями','communication.thoughts':'чтение мыслей','recipe.bloodlust':'кровожадность','recipe.angelic':'ангельский сон','recipe.slot':'дополнительная ячейка, круг','recipe.acuity':'магическая острота','movement.freedom':'свобода перемещения','terrain.difficult.ignore':'свободное движение по трудной местности','vision.invisible':'видение невидимого','recipe.tadpole':'псионическое усиление','recipe.combustion':'горючий состав','recipe.fireConversion':'уязвимость к огню вместо сопротивления','recipe.haste':'дополнительная атака ускорения','recipe.crossbow':'укреплённая позиция','communication.sound':'возможность издавать звуки','light.bright':'яркий свет, м','light.dim':'тусклый свет, м'};const name=names[f.stat];return name?name+(typeof f.value==='number'&&f.value!==1?' '+f.value:''):null;}
function recipeTabletopSize(holder){const names=['Крошечный','Маленький','Средний','Большой','Огромный','Исполинский'],patterns=[/tiny|крошеч/i,/small|маленьк/i,/medium|средн/i,/large|больш/i,/huge|огромн/i,/gargantuan|исполин/i],base=String(holder?.size||(/Полурослик|Гном/i.test(holder?.race)?'Маленький':'Средний')),index=Math.max(0,patterns.findIndex(p=>p.test(base))),steps=holderFxRules(holder,'size.steps').reduce((n,f)=>n+(+f.value||0),0),rank=Math.max(0,Math.min(5,index+steps));return {name:names[rank],rank};}
function recipeTabletopJump(c,running){const multiplier=Math.max(1,...holderFxRules(c,'jump.multiplier').map(f=>+f.value||1));return {long:Math.max(0,eAb(c,'str')*0.3*multiplier*(running?1:0.5)),high:Math.max(0,(3+eMod(c,'str'))*0.3*multiplier*(running?1:0.5)),movementM:Number.parseFloat(speedTotal(c))||0};}
function recipeTabletopMove(c,distance,mode='walk',running=false,difficult=false){
 if(!c||!Number.isFinite(distance)||distance<=0||!['walk','long','high'].includes(mode))return {ok:false,reason:'Укажите положительную дистанцию и способ передвижения.'};
 if(mode!=='walk'&&distance>recipeTabletopJump(c,running)[mode]+1e-8)return {ok:false,reason:'Прыжок превышает доступную дальность.'};
 if(conditionForcesZeroSpeed(effectiveConditions(c)))return {ok:false,reason:'Состояние не позволяет двигаться.'};
 const cost=distance*(difficult&&!recipeTabletopFlag(c,'terrain.difficult.ignore')?2:1)+(running&&mode!=='walk'?3:0);
 if(combat.active){if(combatCurrentKey()!=='ally:'+c.id||cost+(+combat.turn.movementUsed||0)>combatMoveMax()+1e-8)return {ok:false,reason:'Недостаточно оставшегося движения в свой ход.'};combat.turn.movementUsed=(+combat.turn.movementUsed||0)+cost;}
 itemLog(c,(mode==='walk'?'Перемещение':mode==='long'?'Прыжок в длину':'Прыжок вверх')+': '+distance+' м; затраты движения '+cost+' м.');scheduleSave();renderCombat();return {ok:true,cost};
}
function recipeTabletopMoveOpen(id){const c=getCh(id);if(!c)return;const dialog=recipeTabletopDialog();dialog.innerHTML='<form method="dialog"><h3>Перемещение — '+esc(c.name)+'</h3><label>Способ <select id="rm-mode"><option value="walk">Шагом</option><option value="long">Прыжок в длину</option><option value="high">Прыжок вверх</option></select></label><label>Дистанция, м <input id="rm-distance" type="number" min="0.1" step="0.1"></label><label><input id="rm-running" type="checkbox">С разбега 3 м (также расходует движение)</label><label><input id="rm-terrain" type="checkbox">Труднопроходимая местность</label><p id="rm-error" role="alert"></p><button type="button" id="rm-apply" class="btn rub">Переместиться</button><button value="cancel">Отмена</button></form>';document.body.append(dialog);dialog.querySelector('#rm-apply').onclick=()=>{const get=s=>dialog.querySelector(s),r=recipeTabletopMove(c,Number(get('#rm-distance').value),get('#rm-mode').value,get('#rm-running').checked,get('#rm-terrain').checked);if(r.ok)dialog.close();else get('#rm-error').textContent=r.reason;};dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();}
function recipeTabletopJumpOpen(id){const c=getCh(id);if(!c)return;const r=recipeTabletopJump(c,true),s=recipeTabletopJump(c,false);askShow({title:'Прыжки — '+c.name,body:'С разбега 3 м: в длину '+r.long.toFixed(1)+' м, вверх '+r.high.toFixed(1)+' м. С места: '+s.long.toFixed(1)+' / '+s.high.toFixed(1)+' м. Каждый метр расходует метр движения; доступная скорость '+r.movementM+' м.'});}
function recipeTabletopEscape(id){const c=getCh(id);if(!c||!recipeTabletopFlag(c,'movement.freedom'))return false;const names=['Захваченный','Схваченный','Опутанный'];if(effectiveConditions(c).some(n=>['Бессознательный','Парализованный','Ошеломлённый'].includes(n)))return false;const base=Math.max(Number.parseFloat(c.speed)||0,Number.parseFloat(speedTotal(c))||0);if(combat.active&&(combatCurrentKey()!=='ally:'+id||(+combat.turn.movementUsed||0)+1.5>base*(combat.turn.dash?2:1)))return false;if(combat.active)combat.turn.movementUsed=(+combat.turn.movementUsed||0)+1.5;c.cond=normalizeConditions(c.cond).filter(n=>!names.includes(n));for(const e of c.activeFx||[])if(e.k!=='spell'&&!itemOf(e.id)?.mechanics?.profile?.flags?.magical)e.fx=(e.fx||[]).filter(f=>!(f.stat==='condition'&&names.includes(f.value)));fxInvalidate();scheduleSave();renderChars();renderCombat();return true;}
function recipeTabletopConversation(c,uid,target,distance,deep,roll,answer){
 const e=c.activeFx?.find(x=>x.uid===uid),ti=targetInfoOf(target);if(!e||!['animals','thoughts'].includes(e.recipeRule)||!ti.obj||!Number.isFinite(distance)||distance<0||!String(answer||'').trim())return {ok:false,reason:'Выберите существо, расстояние и ответ мастера.'};
 if(e.recipeRule==='animals'&&!/beast|зверь/i.test([ti.obj.creatureType,ti.obj.kind].join(' ')))return {ok:false,reason:'Зелье позволяет говорить только со зверями.'};
 if(e.recipeRule==='thoughts'&&(distance>9||Number((ti.obj.ab||ti.obj.abil)?.int||0)<4||!(ti.obj.languages?.length||ti.obj.langs&&ti.obj.langs!=='—')))return {ok:false,reason:'Нужна видимая цель в пределах 9 м, Интеллект 4 или выше и хотя бы один язык.'};
 if(deep&&(!Number.isInteger(roll)||roll<1||roll>20))return {ok:false,reason:'Введите d20 спасброска Мудрости.'};
 if(combat.active&&!combatCanSpendPure('action','ally:'+c.id))return {ok:false,reason:'Действие сейчас недоступно.'};
 if(combat.active&&!combatSpend('action',e.label,'ally:'+c.id))return {ok:false,reason:'Действие уже потрачено.'};
 const success=deep&&roll+(typeof ti.saveMod==='function'?ti.saveMod('wis'):0)>=13;
 if(success)c.activeFx=c.activeFx.filter(x=>x!==e);
 itemLog(c,e.label+' → '+ti.name+': '+(success?'цель сопротивляется; чтение мыслей завершено':String(answer).trim())+(deep?' · цель заметила зондирование':''));fxInvalidate();scheduleSave();return {ok:true,resisted:!!success};
}
function recipeTabletopConversationOpen(id,uid){
 const c=getCh(id),e=c?.activeFx?.find(x=>x.uid===uid);if(!e)return;
 const dialog=recipeTabletopDialog();dialog.innerHTML='<form method="dialog"><h3>'+esc(e.label)+'</h3><label>Видимое существо <select id="rc-target">'+chars.map(t=>'<option value="ally:'+esc(t.id)+'">'+esc(t.name)+'</option>').concat(foesDB.map(t=>'<option value="foe:'+esc(t.id)+'">'+esc(t.n)+'</option>')).join('')+'</select></label><label>Дистанция, м <input id="rc-distance" type="number" value="0" min="0"></label>'+(e.recipeRule==='thoughts'?'<label><input id="rc-deep" type="checkbox">Глубокое зондирование</label><label>d20 Мудрости цели <input id="rc-roll" type="number" min="1" max="20"></label>':'')+'<label>Ответ мастера <textarea id="rc-answer"></textarea></label><p id="rc-error" role="alert"></p><button type="button" id="rc-apply" class="btn rub">Подтвердить</button><button value="cancel">Отмена</button></form>';
 document.body.append(dialog);dialog.querySelector('#rc-apply').onclick=()=>{const get=s=>dialog.querySelector(s),r=recipeTabletopConversation(c,uid,get('#rc-target').value,Number(get('#rc-distance').value),!!get('#rc-deep')?.checked,Number(get('#rc-roll')?.value),get('#rc-answer').value);if(r.ok)dialog.close();else get('#rc-error').textContent=r.reason;};dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
}

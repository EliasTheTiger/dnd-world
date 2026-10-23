'use strict';
// Classic-script adapter: all outcomes use entered dice and the existing
// defense/formula engine. No resources are committed by collect or preflight.
function artificerSpellSpecial(sp){return sp?.artificerSpell?.special||'';}
function artificerBladeMaterialHeld(caster,sp){if(!['boomingBlade','greenFlameBlade'].includes(artificerSpellSpecial(sp)))return false;return ['MAIN_HAND','OFF_HAND'].some(slot=>{const entry=invEntryOf(caster,caster.equipment?.[slot]),it=entry&&itemOf(entry.itemId);return entry?.qty>0&&it&&itemProfile(it).kind==='weapon'&&!itemProfile(it).weapon?.ranged&&itemEntryGoldValue(entry,it)>=0.1;});}
function artificerSpellReconcile(sp){
 const canonical={'Acid Splash':{special:'acidSplash',die:6,damageType:'кислота',save:'dex'},'Ray of Frost':{special:'rayOfFrost',die:8,damageType:'холод',attack:'ranged'},'Shocking Grasp':{special:'shockingGrasp',die:8,damageType:'электричество',attack:'melee'},'False Life':{special:'falseLife'},'Feather Fall':{special:'featherFall'},'Sanctuary':{special:'sanctuary'}}[sp?.grimoire?.english];
 if(canonical&&!sp.custom&&sp.grimoire?.edition==='2014'&&sp.grimoire?.translation!=='custom'&&sp.mechanics?.origin!=='editor')sp.artificerSpell=canonical;
 if(!sp?.artificerSpell||sp.custom||sp.grimoire?.translation==='custom'||sp.mechanics?.origin==='editor')return;
 const special=artificerSpellSpecial(sp),revision='artificer-spell-runtime-3';
 if(sp.mechanics?.artificerRuntimeRevision===revision&&sp.mechanics?.spell)return;
 const m={schemaVersion:GAME_MECHANICS_SCHEMA_VERSION,mode:special?'structured':'manual',origin:'explicit',activation:{cost:/бонус/.test(sp.t)?'bonus':/реакци/.test(sp.t)?'reaction':/минут/.test(sp.t)?'long':'action',ritual:!!sp.ritual},target:{kind:['magicStone','snare','absorbElements'].includes(special)?'self':'any',base:sp.artificerSpell.area||['catapult','causticBrew'].includes(special)?100:1,allCreatures:!!sp.artificerSpell.area||special==='causticBrew'},components:inferComponents(sp),duration:{kind:sp.conc?'rounds':'instant',rounds:sp.conc?10:0,label:sp.d,concentration:!!sp.conc},resolution:normalizeResolutionContract({attack:null,save:null,contest:null,rolls:[],needsRoll:false},'spell'),effects:[],breakOn:[],special,manualNote:special?'':'Это заклинание высокого круга пока требует решения мастера об изменении сцены; автоматическое применение заблокировано.'};
 const materialFact=sp.artificerSpell.rulesFacts?.material;if(m.components.material&&materialFact){m.components.material.cost=materialFact.minimumGp||0;m.components.material.consume=materialFact.consumed?1:0;}
 if(special==='rayOfFrost')m.resolution=normalizeResolutionContract({attack:{mode:'ranged'},save:null,contest:null,rolls:[{type:'dmg',cnt:1,sides:8,mod:{source:'fixed',value:0},damageType:'холод',levelTiers:[{level:5,cnt:2,sides:8},{level:11,cnt:3,sides:8},{level:17,cnt:4,sides:8}]}],needsRoll:true},'spell');
 m.sourceHash=mechanicsSourceHash(sp,'spell');m.spell=compileSpellRule(sp,m);m.spell.input.requireCompleteRolls=false;m.spell.input.requireSceneFacts=false;m.spell.range.requiresMeasurement=false;m.spell.range.requiresLineOfSight=false;m.spell.range.requiresClearPath=false;m.spell.obstacles.requiresClearPath=false;
 if(special==='snare'){m.components.material=null;m.spell.components.material=null;m.spell.materialComponents=[];}
 if(special==='falseLife'){m.target.kind='self';m.spell.targeting.type='self';}
 if(special==='acidSplash'){m.target.base=2;m.spell.targeting.count={base:2,scaling:'none'};}
 if(special==='featherFall'){m.target.base=5;m.spell.targeting.count={base:5,scaling:'none'};}
 m.artificerRuntimeRevision=revision;sp.mechanics=m;
}
function artificerSpellNumber(label,min=0,max=Infinity,integer=false){const raw=window.prompt(label,'');if(raw==null)throw Error('cancelled');if(!String(raw).trim())throw Error('Введите результат.');const n=Number(String(raw).replace(',','.'));if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error('Недопустимое число: '+label);return n;}
function artificerSpellBool(label){const raw=window.prompt(label+' (да/нет)','');if(raw==null)throw Error('cancelled');if(!/^(да|нет)$/i.test(raw.trim()))throw Error('Ответьте «да» или «нет».');return /^да$/i.test(raw.trim());}
function artificerSpellChoose(label,rows){if(!rows.length)throw Error('Нет подходящих вариантов: '+label);const n=artificerSpellNumber(label+'\n'+rows.map((r,i)=>(i+1)+'. '+r.label).join('\n'),1,rows.length,true);return rows[n-1].value;}
function artificerSpellTier(c){return 1+(c.level>=5?1:0)+(c.level>=11?1:0)+(c.level>=17?1:0);}
function artificerSpellMetalArmor(holder){if(!holder)return null;if(!chars.includes(holder))return typeof holder.armorMetal==='boolean'?holder.armorMetal:null;const eq=holder.equipment||{},armors=Object.values(eq).map(id=>invEntryOf(holder,id)).filter(Boolean).map(e=>itemOf(e.itemId)).filter(it=>it&&itemProfile(it).kind==='armor');return armors.some(it=>itemProfile(it).flags?.metal===true);}
function artificerFeatherLanded(holder){let removed=false;for(const entry of artificerSpellEntries(holder))if(entry.artificerSpell.special==='featherFall'){artificerSpellRemove(holder,entry);removed=true;}if(removed)fxInvalidate();return removed;}
function artificerSpellRopeFeet(entry){if(Number.isFinite(entry?.ropeLengthFeet))return entry.ropeLengthFeet;const n=String(itemOf(entry?.itemId)?.n||'').toLowerCase().replace(/ё/g,'е');if(!/веревк|rope/.test(n))return 0;if(/15\s*м|50\s*f(?:oo|ee)t|50\s*фут/.test(n))return 50;const match=n.match(/(\d+(?:\.\d+)?)\s*(?:фут|feet|foot)/);return match?+match[1]:0;}
function artificerSpellRecord(sp,caster,level,phase='cast'){
 const s=artificerSpellSpecial(sp),a=sp.artificerSpell,m=mechanicsClone(sp.mechanics),tier=artificerSpellTier(caster);
 let attack=a.attack||null,save=a.save||null,die=a.die||0,count=sp.l===0?tier:(a.count||1)+Math.max(0,level-sp.l),dt=a.damageType||'',rolls=[];
 if(s==='causticBrew'){save=phase==='cast'?'dex':null;die=phase==='tick'?4:0;count=2*level;dt='кислота';}
 if(s==='snare'){save='dex';die=0;}
 if(s==='lightningLure'&&phase==='cast'){die=0;}
 if(s==='lightningLure'&&phase==='damage'){save=null;die=8;}
 if(s==='boomingBlade'&&phase==='move'){attack=null;save=null;die=8;count=tier;dt='звук';}
 if(s==='greenFlameBlade'&&phase==='secondary'){attack=null;save=null;die=tier>1?8:0;count=tier-1;dt='огонь';}
 if(s==='absorbElements'){attack=null;save=null;die=6;count=level;dt=phase;}
 if(s==='magicStone'){attack='ranged';save=null;die=6;count=1;dt='дробящий';}
 if(die||s==='greenFlameBlade'&&phase==='secondary')rolls=[{type:'dmg',cnt:count,sides:die,mod:{source:['magicStone'].includes(s)||s==='greenFlameBlade'&&phase==='secondary'?'spellAbility':'fixed',value:0},damageType:dt}];
 if(s==='falseLife')rolls=[{type:'temp',cnt:1,sides:4,mod:{source:'fixed',value:4+5*Math.max(0,level-1)}}];
 m.resolution=normalizeResolutionContract({attack:attack?{mode:attack}:null,save:save?{key:save,dc:{source:'spell'},half:false,tags:['magical']}:null,saveAffectsDamage:s!=='rayOfSickness',contest:null,rolls,needsRoll:!!(attack||save||die)},'spell');
 return {...sp,mechanics:m};
}
function artificerSpellSpec(sp,caster,target,level,input={},phase='cast'){
 const s=artificerSpellSpecial(sp),ti=targetInfoOf(target),f=input.byTarget?.[target]||{};
 if(['boomingBlade','greenFlameBlade'].includes(s)&&phase==='cast'){
  const entry=invEntryOf(caster,input.weaponEntryId),it=entry&&itemOf(entry.itemId);if(!it||!entry||!(entry.qty>0)||itemProfile(it).kind!=='weapon'||itemProfile(it).weapon?.ranged)throw Error('Выберите имеющееся рукопашное оружие.');
  if(!(itemEntryGoldValue(entry,it)>=0.1))throw Error('Оружие должно стоить не менее 1 см.');
  const spec=weaponSpecOf(caster,it,ti,{entryId:entry.id,distanceM:f.distanceM,within5:true}),tier=artificerSpellTier(caster);
  if(tier>1)spec.rows.push({key:'artificerBladeDamage',type:'dmg',side:'caster',cnt:tier-1,sides:8,mod:0,dmgType:s==='boomingBlade'?'звук':'огонь',label:'Дополнительный урон клинка: '+(tier-1)+'d8'});
  return finalizeRollSpec(spec,{kind:'weapon',id:it.id,name:it.n});
 }
 const rec=artificerSpellRecord(sp,caster,level,phase),spec=structuredRollSpecOf(rec,{kind:'spell',caster,slotLvl:level,target:ti,distanceM:f.distanceM});
 if(s==='boomingBlade'&&phase==='move')spec.meta.artificerOngoingDamage=true;
 if(s==='shockingGrasp'&&f.metalArmor===true){const row=spec.rows.find(r=>r.type==='atk'),cond=attackConditionMode(caster,ti,{mode:'melee',within5:true,distanceM:f.distanceM}),fx=rollFxEntries(caster,'attack.'+spellAbOf(caster)).concat(rollFxEntries(caster,'spell.attack')),adv=!abilityGameplayElusive(ti),dis=cond.dis.length>0||fx.some(x=>x.mode==='dis');row.adv=adv===dis?0:adv?1:2;row.hint+=' · металлический доспех цели';}
 if(s==='rayOfSickness')for(const row of spec.rows)if(row.type==='save')row.requiredOnHit=true;
 if(rec.mechanics.resolution.save&&rec.mechanics.resolution.saveAffectsDamage!==false)for(const row of spec.rows)if(row.type==='dmg')row.requiredOnFailedSave=true;
 return finalizeRollSpec(spec,spec.contract?.source);
}
function artificerSpellReadValues(spec,shared){
 if(!artificerSanctuaryPrepareSpec(spec))throw Error('cancelled');
 artificerAbsorbPrepare(spec);
 const values={};
 for(const row of spec.rows){
  if(row.fixed){values[row.key]=0;continue;}if(row.autoFail)continue;
  if((row.optional||row.reactionGroup)&&!artificerSpellBool('Использовать: '+row.label))continue;
  const outcome=resolveOutcome(spec,values);if(row.type==='save'&&spec.rows.some(r=>r.type==='atk')&&outcome.hit===false)continue;
  if(row.type==='dmg'&&outcome.hit===false)continue;
  if(row.type==='dmg'&&spec.meta.saveAffectsDamage!==false&&outcome.saveOk===true)continue;
  if(row.natural){values[row.key]=artificerSpellNumber(row.label+(row.adv?' — первый d20':''),1,20,true);if(row.adv)values[row.key+'_2']=artificerSpellNumber('Второй d20 ('+(row.adv===1?'преимущество':'помеха')+')',1,20,true);}
  else if(row.cnt&&row.sides){const cnt=row.cnt*(row.type==='dmg'&&outcome.crit?2:1),sharedKey=row.type==='dmg'?row.key+':'+cnt+'d'+row.sides:null;if(sharedKey&&shared?.[sharedKey]!=null)values[row.key]=shared[sharedKey];else{values[row.key]=artificerSpellNumber(row.label+' — сумма '+cnt+'d'+row.sides,cnt,cnt*row.sides,true);if(sharedKey&&shared)shared[sharedKey]=values[row.key];}}
  else values[row.key]=artificerSpellNumber(row.label,-1000,100000,true);
 }
 const check=validateFormulaValues(spec,values,resolveOutcome(spec,values));if(!check.ok)throw Error(check.errors?.join(' ')||'Не все броски заполнены.');return values;
}
function artificerSpellResolved(spec,values){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Нужны результаты бросков.');values={...values};for(const row of spec.rows)if(row.fixed){if(values[row.key]!=null&&values[row.key]!==0)throw Error('Фиксированный модификатор не требует броска костей.');values[row.key]=0;}const out=resolveOutcome(spec,values),check=validateFormulaValues(spec,values,out);if(!check.ok)throw Error(check.errors?.join(' ')||'Не все броски заполнены.');const built=castFormulaRollsBuild(spec,values,out);if(!built.ok)throw Error(built.reason||'Не удалось проверить броски.');return built.rolls;}
function artificerFireBoltObject(sp,targets){return sp?.grimoire?.english==='Fire Bolt'&&sp.grimoire.edition==='2014'&&!sp.custom&&sp.grimoire.translation!=='custom'&&sp.mechanics?.origin!=='editor'&&targets.length===1&&/^object(?::\d+)?$/.test(targets[0]);}
function artificerSceneObjectKey(label){return String(label||'').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ');}
function artificerSceneObjects(){const byKey=new Map();for(const row of bg3SceneState.spellEffects||[])if(row.data?.type==='artificerObject')byKey.set(row.data.objectKey,row);return [...byKey.values()];}
function artificerSceneObjectFacts(raw){
 if(!raw||typeof raw!=='object'||!String(raw.label||'').trim()||String(raw.label).length>160||!Number.isInteger(raw.ac)||raw.ac<1||raw.ac>30||!Number.isInteger(raw.hp)||raw.hp<0||raw.hp>100000||typeof raw.flammable!=='boolean'||typeof raw.heldOrWorn!=='boolean')throw Error('Для предмета нужны название и место, КД 1–30, целые хиты, горючесть и указание, несут или носят ли его.');
 return {objectKey:artificerSceneObjectKey(raw.label),label:raw.label.trim(),ac:raw.ac,hp:raw.hp,flammable:raw.flammable,heldOrWorn:raw.heldOrWorn};
}
function artificerSceneObjectCollect(){
 const label=window.prompt('Название предмета и его место в сцене (для отличия от похожих предметов)','');if(label==null)throw Error('cancelled');
 const previous=artificerSceneObjects().find(row=>row.data.objectKey===artificerSceneObjectKey(label)),hint=previous?' (последняя запись: КД '+previous.data.ac+', '+previous.data.hp+' хитов)':'';
 return artificerSceneObjectFacts({label,ac:artificerSpellNumber('КД предмета'+hint,1,30,true),hp:artificerSpellNumber('Текущие хиты предмета по решению мастера',0,100000,true),flammable:artificerSpellBool('Этот предмет горючий'),heldOrWorn:artificerSpellBool('Этот предмет сейчас кто-либо несёт или носит')});
}
function artificerSceneObjectCommit(sp,caster,castId,object,{damage=0,ignite=false,index=0}={}){
 const previous=artificerSceneObjects().find(row=>row.data.objectKey===object.objectKey),physicalId='physical-object:'+castId+':'+index,data={...mechanicsClone(object),type:'artificerObject',originCastId:castId,hpBefore:object.hp,hp:Math.max(0,object.hp-damage),damage,burning:!!previous?.data.burning||ignite};
 bg3SceneState.spellEffects=bg3SceneState.spellEffects||[];bg3SceneState.spellEffects.push({id:'spell-world:'+physicalId,castId:physicalId,spellId:sp.id,casterId:caster.id,kind:'environment',operation:'set',data,appliedRound:fxRound});bg3SceneState.revision=(+bg3SceneState.revision||0)+1;
 castLogLine(object.label+': '+data.hp+' хитов'+(ignite?' · воспламенился.':'.'));
}
function artificerFireBoltObjectPreflight(sp,caster,targets,rolls,input){
 try{
  const a=input?.artificerFireObject,object=artificerSceneObjectFacts(a?.object);if(!Number.isFinite(a.distanceM)||a.distanceM<0||a.distanceM>36.576||a.clearPath!==true)throw Error('Предмет должен быть в пределах 120 футов и без полного укрытия.');
  const ti=targetInfoOf(targets[0]);if(!ti.known||ti.ac!==object.ac)throw Error('КД предмета изменилась; повторите атаку.');
  const built=rolls&&bg3LifecycleRuntime.githbornBuiltRolls.get(rolls);if(!bg3BuiltRollAttestationCheck(rolls)||built?.sourceBinding.caster!==caster||built.sourceBinding.kind!=='spell'||built.sourceBinding.targetKind!=='object'||built.spec.contract?.source?.id!==sp.id||built.spec.meta.target.ac!==object.ac)throw Error('Для огненного снаряда нужны введённые кости атаки именно по этому предмету.');
  const verified=artificerSpellResolved(built.spec,built.entered);if(verified.attackMade!==true||typeof verified.hit!=='boolean'||verified.hit&&!Number.isFinite(verified.dmgTotal)||verified.hit!==rolls.hit||verified.dmgTotal!==rolls.dmgTotal)throw Error('Повторите проверку попадания и урона огненного снаряда.');
  return {ok:true,handled:true,plan:{special:'fireBoltObject',input:{object},outcomes:[],level:0,objectRolls:verified}};
 }catch(error){return {ok:false,reason:error.message};}
}
function artificerSpellCollectInput(sp,targets,input){
 if(input?.sanctuaryLost)return {ok:true,input};
 if(artificerFireBoltObject(sp,targets)){
  try{const object=artificerSceneObjectCollect(),a=input.artificerFireObject={object,distanceM:artificerSpellNumber('Расстояние до предмета, м',0,36.576),clearPath:artificerSpellBool('До предмета нет полного укрытия')};if(castCtx)castCtx.objectTarget={name:object.label,ac:object.ac};input.byTarget=input.byTarget||{};input.byTarget[targets[0]]={...input.byTarget[targets[0]],distanceM:a.distanceM,clearPath:a.clearPath,totalCover:!a.clearPath};return {ok:true,input};}catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Наложение отменено; ресурсы не потрачены.':error.message};}
 }
 const s=artificerSpellSpecial(sp);if(!s)return {ok:true,input};
 try{
  const caster=getCh(castCtx?.casterId);if(!caster)throw Error('Заклинатель не найден.');
  const selected=typeof document!=='undefined'?document.getElementById('castSlot')?.value:null,level=sp.l===0?0:parseInt(selected,10)||sp.l;
  const a=input.artificerSpell={byTarget:{},values:{},level};
  if(s==='absorbElements'){a.damageType=artificerSpellChoose('Вид только что получаемого урона',['кислота','холод','огонь','электричество','звук'].map(value=>({value,label:value})));a.triggerConfirmed=artificerSpellBool('Это реакция на ещё не применённый урон выбранного вида');return {ok:true,input};}
  if(s==='magicStone'){a.stones=artificerSpellNumber('Сколько немагических камешков вы касаетесь',1,3,true);return {ok:true,input};}
  if(s==='falseLife'){a.values[targets[0]]=artificerSpellReadValues(artificerSpellSpec(sp,caster,targets[0],level,a));return {ok:true,input};}
  if(s==='acidSplash'&&targets.length>1)a.targetsWithin5=artificerSpellBool('Два существа находятся не далее 5 футов друг от друга');
  if(s==='featherFall')a.triggerConfirmed=artificerSpellBool('Это реакция на начавшееся падение; урон от приземления ещё не применён');
  if(s==='snare'){
   if(!combat.active)a.minuteCompleted=artificerSpellBool('Прошла минута непрерывного наложения');
   a.ropeEntryId=artificerSpellChoose('Верёвка: будут израсходованы 25 футов',caster.inventory.filter(e=>e.qty>0&&/веревк|rope/.test(String(itemOf(e.itemId)?.n||'').toLowerCase().replace(/ё/g,'е'))).map(e=>({value:e.id,label:itemOf(e.itemId).n+' × '+e.qty})));
   a.ropeLengthFeet=artificerSpellRopeFeet(invEntryOf(caster,a.ropeEntryId));if(a.ropeLengthFeet<25)throw Error('Нужно не менее 25 футов верёвки в выбранном запасе.');a.placementConfirmed=artificerSpellBool('Круг радиусом 5 футов размещён на земле в пределах касания');return {ok:true,input};
  }
  if(['boomingBlade','greenFlameBlade'].includes(s))a.weaponEntryId=artificerSpellChoose('Рукопашное оружие',caster.inventory.filter(e=>e.qty>0&&itemProfile(itemOf(e.itemId)).kind==='weapon'&&!itemProfile(itemOf(e.itemId)).weapon?.ranged).map(e=>({value:e.id,label:itemOf(e.itemId).n})));
  if(['swordBurst','thunderclap','causticBrew','createBonfire','catapult'].includes(s))a.allIncluded=artificerSpellBool(s==='catapult'?'Выбранные цели перечислены по порядку на траектории предмета, все существа на пути учтены':'Выбраны все существа в области, включая союзников');
  if(s==='catapult'){a.objectWeight=artificerSpellNumber('Вес бросаемого предмета, фунтов',1,5*level);a.objectDistanceM=artificerSpellNumber('Расстояние до неносимого предмета, м',0,18.288);a.objectUnattended=artificerSpellBool('Предмет никто не носит и не несёт');a.objectHp=artificerSpellNumber('Текущие хиты предмета',0,10000,true);}
  if(s==='createBonfire'){a.groundVisible=artificerSpellBool('Костёр помещён на видимую землю в пределах 60 футов');a.zoneName=window.prompt('Ориентир куба костра (5 футов)', '');if(a.zoneName==null)throw Error('cancelled');if(!a.zoneName.trim())throw Error('Укажите место костра.');a.sceneObjects=[];const count=artificerSpellNumber('Сколько горючих предметов в кубе костра никто не несёт и не носит (0, если таких нет)',0,20,true);for(let i=0;i<count;i++){const object=artificerSceneObjectCollect();object.inArea=artificerSpellBool(object.label+' находится в кубе костра');a.sceneObjects.push(object);}}
  const shared={},relevant=s==='catapult'?targets.slice():targets;
  for(const target of relevant){
   if(s==='createBonfire'&&target==='object')continue;
   const ti=targetInfoOf(target);if(!ti.obj)throw Error('Нужна существующая цель-существо.');
   const f=a.byTarget[target]={distanceM:artificerSpellNumber('Расстояние до '+ti.name+', м'),clearPath:artificerSpellBool('До '+ti.name+' нет полного укрытия'),visible:artificerSpellBool('Заклинатель видит '+ti.name)};
   if(s==='shockingGrasp')f.metalArmor=artificerSpellMetalArmor(ti.obj)??artificerSpellBool(ti.name+' носит металлический доспех');
   if(s==='featherFall'){f.falling=artificerSpellBool(ti.name+' сейчас падает');continue;}
   if(s==='sanctuary')continue;
   if(['causticBrew','createBonfire','catapult'].includes(s))f.inArea=artificerSpellBool(ti.name+' находится в выбранной области/на траектории');
   if(['thornWhip','lightningLure'].includes(s)){f.pullFeet=artificerSpellNumber('Желаемое подтягивание '+ti.name+', футов',0,10);f.clearPull=artificerSpellBool('Путь подтягивания свободен');f.size=recipeTabletopSize(ti.obj).rank;}
   const spec=artificerSpellSpec(sp,caster,target,level,a),v=artificerSpellReadValues(spec,['swordBurst','thunderclap','createBonfire','acidSplash'].includes(s)?shared:null);a.values[target]=v;
   const rolled=artificerSpellResolved(spec,v);
   if(s==='lightningLure'&&rolled.saveOk===false&&Math.max(0,f.distanceM-f.pullFeet*0.3048)<=1.524)a.secondaryValues=artificerSpellReadValues(artificerSpellSpec(sp,caster,target,level,a,'damage'));
   if(s==='catapult'&&rolled.saveOk===false)break;
  }
  if(s==='greenFlameBlade'&&artificerSpellResolved(artificerSpellSpec(sp,caster,targets[0],level,a),a.values[targets[0]]).hit===true&&artificerSpellBool('Перекинуть пламя на другую видимую цель в 5 футах от первой')){
   a.secondaryTarget=artificerSpellChoose('Вторая цель',chars.concat(foesDB).map(h=>({value:(foesDB.includes(h)?'foe:':'ally:')+h.id,label:h.name||h.n})).filter(r=>r.value!==targets[0]));a.secondaryInRange=artificerSpellBool('Вторая цель видима и в пределах 5 футов от первой');a.secondaryValues=artificerSpellReadValues(artificerSpellSpec(sp,caster,a.secondaryTarget,level,a,'secondary'));
  }
  return {ok:true,input};
 }catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Наложение отменено; ресурсы не потрачены.':error.message};}
}
function artificerSpellPreflight(sp,caster,targets,level,rolls,byTarget,input){
 if(artificerFireBoltObject(sp,targets))return artificerFireBoltObjectPreflight(sp,caster,targets,rolls,input);
 const s=artificerSpellSpecial(sp);if(!s)return {ok:true,handled:false};
 try{
  const a=input?.artificerSpell;if(!a||a.level!==level)throw Error('Повторите ввод после изменения круга заклинания.');const plan={special:s,input:mechanicsClone(a),outcomes:[],secondary:null,level};
  if(['swordBurst','thunderclap','createBonfire','causticBrew','catapult'].includes(s)&&a.allIncluded!==true)throw Error('Подтвердите всех существ в области.');
  if(s==='absorbElements'){a.damageType=dmgTypeCanon(a.damageType);if(a.triggerConfirmed!==true||!['кислота','холод','огонь','электричество','звук'].includes(a.damageType))throw Error('Нужен подтверждённый подходящий урон, вызвавший реакцию.');plan.input.damageType=a.damageType;return {ok:true,handled:true,plan};}
  if(s==='magicStone'){if(!Number.isInteger(a.stones)||a.stones<1||a.stones>3)throw Error('Выберите 1–3 камешка.');return {ok:true,handled:true,plan};}
  if(s==='falseLife'){if(targets.length!==1||targetInfoOf(targets[0]).obj!==caster)throw Error('Ложная жизнь действует только на заклинателя.');plan.outcomes=[{target:targets[0],rolls:artificerSpellResolved(artificerSpellSpec(sp,caster,targets[0],level,a),a.values?.[targets[0]])}];return {ok:true,handled:true,plan};}
  if(s==='acidSplash'&&(targets.length<1||targets.length>2||targets.length===2&&a.targetsWithin5!==true))throw Error('Выберите одно существо либо двух в пределах 5 футов друг от друга.');
  if(s==='featherFall'&&(targets.length<1||targets.length>5||a.triggerConfirmed!==true))throw Error('Нужна реакция на падение и не более пяти падающих существ.');
  if(s==='snare'){const e=invEntryOf(caster,a.ropeEntryId);if(combat.active){const longCast=arcanumLongCastPreflight(sp,caster,input);if(!longCast.ok)return longCast;}else if(a.minuteCompleted!==true)throw Error('Подтвердите минуту непрерывного наложения.');if(a.placementConfirmed!==true||!e||e.qty<1||!(a.ropeLengthFeet>=25)||a.ropeLengthFeet!==artificerSpellRopeFeet(e))throw Error('Для силка нужны 25 футов имеющейся верёвки и место на земле.');plan.ropeEntryId=e.id;return {ok:true,handled:true,plan};}
  if(s==='catapult'&&(!(a.objectWeight>=1&&a.objectWeight<=level*5)||!(a.objectDistanceM>=0&&a.objectDistanceM<=18.288)||a.objectUnattended!==true||!Number.isInteger(a.objectHp)||a.objectHp<0))throw Error('Проверьте вес, дистанцию и хиты неносимого предмета.');
  if(s==='createBonfire'&&(a.groundVisible!==true||!String(a.zoneName||'').trim()))throw Error('Нужно видимое место костра на земле.');
  if(s==='createBonfire'){if(!Array.isArray(a.sceneObjects)||a.sceneObjects.length>20)throw Error('Укажите список неносимых горючих предметов в костре; пустой список допустим.');plan.sceneObjects=a.sceneObjects.map(raw=>{const object=artificerSceneObjectFacts(raw);if(!object.flammable||object.heldOrWorn||raw.inArea!==true)throw Error('Костёр поджигает только горючие предметы в своём кубе, которые никто не несёт и не носит.');return object;});if(new Set(plan.sceneObjects.map(o=>o.objectKey)).size!==plan.sceneObjects.length)throw Error('Один предмет нельзя включить в список костра дважды.');}
  const maxM={boomingBlade:1.524,greenFlameBlade:1.524,shockingGrasp:1.524,lightningLure:4.572,thornWhip:9.144,swordBurst:1.524,thunderclap:1.524,causticBrew:9.144,createBonfire:18.288,catapult:45.72,sanctuary:9.144};
  for(const target of targets){if(s==='createBonfire'&&target==='object')continue;const ti=targetInfoOf(target),f=a.byTarget?.[target];if(!ti.obj||!f||!Number.isFinite(f.distanceM)||f.distanceM<0||f.distanceM>(maxM[s]||18.288)||f.clearPath!==true)throw Error('Цель отсутствует, вне дистанции или за укрытием.');
   if(['swordBurst','thunderclap'].includes(s)&&ti.obj===caster)throw Error('Этот заговор затрагивает остальных существ, кроме заклинателя.');
   if(['frostbite','lightningLure'].includes(s)&&f.visible!==true)throw Error('Нужно видеть цель.');
   if(s==='shockingGrasp'&&(typeof f.metalArmor!=='boolean'||artificerSpellMetalArmor(ti.obj)!=null&&f.metalArmor!==artificerSpellMetalArmor(ti.obj)))throw Error('Подтвердите актуальный материал доспеха цели.');
   if(s==='featherFall'){if(f.falling!==true)throw Error('Заклинание действует только на падающих существ.');plan.outcomes.push({target,rolls:{},facts:mechanicsClone(f)});continue;}
   if(s==='sanctuary'){plan.outcomes.push({target,rolls:{},facts:mechanicsClone(f)});continue;}
   if(['causticBrew','createBonfire','catapult'].includes(s)&&f.inArea!==true)throw Error('Цель должна находиться в области.');
   if(['thornWhip','lightningLure'].includes(s)&&(!Number.isFinite(f.pullFeet)||f.pullFeet<0||f.pullFeet>10||f.pullFeet>f.distanceM/0.3048||f.clearPull!==true))throw Error('Укажите допустимое подтягивание по свободному пути.');
   const outcome=artificerSpellResolved(artificerSpellSpec(sp,caster,target,level,a),a.values?.[target]);plan.outcomes.push({target,rolls:outcome,facts:mechanicsClone(f)});
   if(s==='lightningLure'&&outcome.saveOk===false&&Math.max(0,f.distanceM-f.pullFeet*0.3048)<=1.524)plan.secondary={target,rolls:artificerSpellResolved(artificerSpellSpec(sp,caster,target,level,a,'damage'),a.secondaryValues)};
   if(s==='catapult'&&outcome.saveOk===false){plan.objectDamage=outcome.dmgRaw;break;}
  }
  if(s==='greenFlameBlade'&&a.secondaryTarget){if(a.secondaryTarget===targets[0]||a.secondaryInRange!==true||!targetInfoOf(a.secondaryTarget).obj||plan.outcomes[0].rolls.hit!==true)throw Error('Для перескока пламени нужна другая видимая цель в 5 футах.');plan.secondary={target:a.secondaryTarget,rolls:artificerSpellResolved(artificerSpellSpec(sp,caster,a.secondaryTarget,level,a,'secondary'),a.secondaryValues)};}
  if(['swordBurst','thunderclap','createBonfire','acidSplash'].includes(s)){const totals=plan.outcomes.map(row=>a.values[row.target]?.dmg0).filter(v=>v!=null);if(totals.some(v=>v!==totals[0]))throw Error('Для одновременного урона области используется одна общая сумма костей.');}
  for(const outcome of [...plan.outcomes,...(plan.secondary?[plan.secondary]:[])])if(!preflightOutcomeReactions(outcome.rolls,outcome.target,true))throw Error('Защитная реакция цели изменилась.');
  return {ok:true,handled:true,plan};
 }catch(error){return {ok:false,reason:error.message};}
}
function artificerSpellEffect(target,sp,caster,castId,fx,data={}){
 const ti=targetInfoOf(target);if(!ti.obj)throw Error('Цель эффекта пропала.');const entry={uid:fxUid(),k:'spell',id:sp.id,label:sp.n,from:caster.name,casterId:caster.id,castId,stackKey:'spell:'+sp.id,conc:!!sp.conc,power:data.level||sp.l,fx,mechanicsVersion:GAME_MECHANICS_SCHEMA_VERSION,durationKind:'manual',durationLabel:sp.d,appliedRound:fxRound,artificerSpell:{special:artificerSpellSpecial(sp),...data}};
 if(data.expiresAtRound!=null)entry.expiresAtRound=data.expiresAtRound;
 if(data.untilStart)entry.combatUntilTurn=data.untilStart;
 if(data.untilEnd){entry.combatUntilEndTurn=data.untilEnd;entry.combatSkipMatchingEnd=combat.active&&combatCurrentKey()===data.untilEnd;}
 if(ti.kind==='ally')applyFxTo(ti.id,entry);else applyFxToFoe(ti.obj,entry);return entry;
}
function artificerSpellCommitCast(enginePlan,sp,caster,castId){
 const p=enginePlan.artificerSpell.plan,s=p.special,a=p.input,source='ally:'+caster.id;
 if(s==='fireBoltObject')artificerSceneObjectCommit(sp,caster,castId,a.object,{damage:p.objectRolls.hit?p.objectRolls.dmgTotal:0,ignite:p.objectRolls.hit&&a.object.flammable&&!a.object.heldOrWorn});
 if(s==='createBonfire')p.sceneObjects.forEach((object,index)=>artificerSceneObjectCommit(sp,caster,castId,object,{ignite:true,index}));
 if(s==='magicStone')for(const h of chars.concat(foesDB))h.activeFx=(h.activeFx||[]).filter(e=>!(e.casterId===caster.id&&e.artificerSpell?.special==='magicStone'));
 if(['magicStone','createBonfire','snare','absorbElements'].includes(s)){
  const fx=s==='absorbElements'?[{stat:'damage.rule',mode:'grant',value:{mode:'resist',types:[a.damageType],when:''}}]:[];
  artificerSpellEffect(source,sp,caster,castId,fx,{level:p.level,stones:a.stones,zoneName:a.zoneName,damageType:a.damageType,phase:s==='absorbElements'?'resist':'active',expiresAtRound:fxRound+(s==='snare'?4800:10),...(s==='absorbElements'?{resistanceUntil:source}:{}),...(s==='snare'?{armed:true}:{}),members:s==='createBonfire'?p.outcomes.map(o=>o.target):[]});
  if(s==='snare'){const e=invEntryOf(caster,p.ropeEntryId);e.qty--;if(e.qty<=0)caster.inventory=caster.inventory.filter(x=>x!==e);const spare=a.ropeLengthFeet-25;if(spare>0){const leftover=mechanicsClone(e);leftover.id='rope_remnant_'+fxUid();leftover.qty=1;leftover.notes='Остаток верёвки: '+spare+' футов';leftover.ropeLengthFeet=spare;caster.inventory.push(leftover);}}
 }
 for(const row of p.outcomes){
  const r=row.rolls,priorTemp=+targetInfoOf(row.target).obj?.hpTemp||0;consumeOutcomeRollFx(caster,row.target,r,targetInfoOf(row.target),['boomingBlade','greenFlameBlade'].includes(s)?'weapon':'spell');applyRollsToTarget(row.target,r,sp.n,{sourceActorKey:source});
  if(s==='falseLife'&&r.tempTotal>priorTemp){const fx=artificerSpellEffect(row.target,sp,caster,castId,[],{level:p.level,expiresAtRound:fxRound+600});fx.tempHpGrant=true;targetInfoOf(row.target).obj.hpTempSourceUid=fx.uid;}
  if(s==='featherFall')artificerSpellEffect(row.target,sp,caster,castId,[{stat:'damage.fall.immune',mode:'set',value:1},{stat:'speed.fall',mode:'set',value:'18,288 м/раунд'},{stat:'note',mode:'text',value:'Падает на 60 футов за раунд; при приземлении без урона эффект для этой цели завершается.'}],{level:p.level,expiresAtRound:fxRound+10});
  if(s==='shockingGrasp'&&r.hit===true)artificerSpellEffect(row.target,sp,caster,castId,[{stat:'combat.reaction.block',mode:'set',value:1}],{untilStart:source,expiresAtRound:combat.active?undefined:fxRound+1});
  if(s==='rayOfFrost'&&r.hit===true)artificerSpellEffect(row.target,sp,caster,castId,[{stat:'speed',mode:'add',value:'-10 футов'}],{untilStart:source,expiresAtRound:combat.active?undefined:fxRound+1});
  if(s==='sanctuary')artificerSpellEffect(row.target,sp,caster,castId,[{stat:'note',mode:'text',value:'Перед направленной атакой или вредным заклинанием нападающий проходит спасбросок Мудрости СЛ '+spellDC(caster)+'. Области действуют без этой проверки.'}],{level:p.level,dc:spellDC(caster),expiresAtRound:fxRound+10});
  if(s==='rayOfSickness'&&r.hit===true&&r.saveOk===false)artificerSpellEffect(row.target,sp,caster,castId,[{stat:'condition',mode:'text',value:'Отравленный'}],{level:p.level,untilEnd:source,expiresAtRound:combat.active?undefined:fxRound+2});
  if(s==='frostbite'&&r.saveOk===false)artificerSpellEffect(row.target,sp,caster,castId,[{stat:'weapon.attack',mode:'dis',value:1,consume:'roll'}],{untilEnd:row.target,expiresAtRound:combat.active?undefined:fxRound+2});
  if(s==='boomingBlade'&&r.hit===true)artificerSpellEffect(row.target,sp,caster,castId,[],{level:p.level,tier:artificerSpellTier(caster),untilStart:source,expiresAtRound:combat.active?undefined:fxRound+1});
  if(s==='causticBrew'&&r.saveOk===false)artificerSpellEffect(row.target,sp,caster,castId,[],{level:p.level,expiresAtRound:fxRound+10});
  if(s==='thornWhip'&&r.hit===true||s==='lightningLure'&&r.saveOk===false){const size=recipeTabletopSize(targetInfoOf(row.target).obj).rank,feet=s==='thornWhip'&&size>3?0:row.facts.pullFeet;if(feet>0){const holder=targetInfoOf(row.target).obj;holder.lastForcedMovement={sourceActorKey:source,castId,distanceM:feet*0.3048,toward:source,round:fxRound};castLogLine(targetInfoOf(row.target).name+': подтянут на '+feet+' футов к '+caster.name+'.');}}
 }
 if(p.secondary)applyRollsToTarget(p.secondary.target,p.secondary.rolls,sp.n,{sourceActorKey:source});
 if(s==='catapult'){const physicalId='physical-object:'+castId+':catapult';bg3SceneState.spellEffects=bg3SceneState.spellEffects||[];bg3SceneState.spellEffects.push({id:'spell-world:'+physicalId,castId:physicalId,spellId:sp.id,casterId:caster.id,kind:'environment',operation:'set',data:{type:'artificerCatapultObject',originCastId:castId,label:'Предмет Катапульты',weightLb:a.objectWeight,hpBefore:a.objectHp,hp:Math.max(0,a.objectHp-(p.objectDamage||0)),damage:p.objectDamage||0},appliedRound:fxRound});bg3SceneState.revision=(+bg3SceneState.revision||0)+1;castLogLine('Предмет «Катапульты»: '+Math.max(0,a.objectHp-(p.objectDamage||0))+'/'+a.objectHp+' хитов после столкновения.');}
 lastCastEvent={castId,casterId:caster.id,spellId:sp.id,usedSlotLvl:p.level,round:fxRound,targets:enginePlan.targets.slice(),outcomeNotes:[]};
 recipeTabletopSpellTrigger(caster,sp);castLogLine(caster.name+': «'+sp.n+'» применено.');artificerSpellRefresh();
}
function artificerSpellRefresh(){fxInvalidate();scheduleSave();renderChars();renderFoes();renderCombat();}
function artificerSpellEntries(holder){return (holder?.activeFx||[]).filter(e=>e.artificerSpell);}
function artificerSpellRemove(holder,entry){detachActiveFx(holder,entry);holder.activeFx=holder.activeFx.filter(e=>e!==entry);}
function artificerSpellTurnEnd(actorKey){
 try{
  const plans=[],stamp=arcanumTurnStamp();
  for(const holder of chars.concat(foesDB))for(const entry of artificerSpellEntries(holder)){
   const a=entry.artificerSpell;if(a.special!=='createBonfire'||a.receipts?.[stamp+':end:'+actorKey]||arcanumSuppressed(holder,entry))continue;
   const caster=getCh(entry.casterId),sp=spellOf(entry.id);if(!caster||!sp)continue;
   const inside=artificerSpellBool(combatActorName(actorKey)+' заканчивает ход в костре «'+a.zoneName+'»');
   if(!inside){plans.push({entry,receipt:stamp+':end:'+actorKey});continue;}
   const spec=artificerSpellSpec(sp,caster,actorKey,a.level),values=artificerSpellReadValues(spec);plans.push({entry,receipt:stamp+':end:'+actorKey,rolls:artificerSpellResolved(spec,values)});
  }
  for(const p of plans){if(p.rolls)applyRollsToTarget(actorKey,p.rolls,p.entry.label,{sourceActorKey:'ally:'+p.entry.casterId});p.entry.artificerSpell.receipts=p.entry.artificerSpell.receipts||{};p.entry.artificerSpell.receipts[p.receipt]=true;}
  if(plans.length)fxInvalidate();return true;
 }catch(error){setStatus(error.message==='cancelled'?'Завершение хода отменено: сначала разрешите костёр.':error.message,true);return false;}
}
function artificerSpellMovePreflight(actorKey,distanceM){
 try{
  const holder=combatActorByKey(actorKey),plans=[];if(!holder||!(distanceM>=1.524))return {ok:true,plans};
  for(const entry of artificerSpellEntries(holder)){if(entry.artificerSpell.special!=='boomingBlade'||arcanumSuppressed(holder,entry))continue;const caster=getCh(entry.casterId),sp=spellOf(entry.id);if(!caster||!sp)continue;const spec=artificerSpellSpec(sp,caster,actorKey,entry.artificerSpell.level,{},'move');plans.push({holder,entry,target:actorKey,rolls:artificerSpellResolved(spec,artificerSpellReadValues(spec))});}
  return {ok:true,plans};
 }catch(error){return {ok:false,reason:error.message==='cancelled'?'Перемещение отменено; введите урон громовой метки.':error.message};}
}
function artificerSpellMoveCommit(plan){for(const row of plan.plans||[]){if(!row.holder.activeFx.includes(row.entry))throw Error('Громовая метка изменилась.');applyRollsToTarget(row.target,row.rolls,row.entry.label,{sourceActorKey:'ally:'+row.entry.casterId});artificerSpellRemove(row.holder,row.entry);}fxInvalidate();}

// Incoming elemental damage joins the existing reaction transaction. Merely
// selecting the reaction never changes HP, slots, materials, or turn resources.
function artificerAbsorbCandidate(actorKey,slotLevel,damageType,reactionCommitted=false){
 damageType=dmgTypeCanon(damageType);
 const caster=combatActorByKey(actorKey),sp=spellsDB.find(row=>artificerSpellSpecial(row)==='absorbElements'&&grimoireActive(row));
 if(!caster||!chars.includes(caster)||!sp||!Number.isInteger(slotLevel)||slotLevel<1||slotLevel>9||!['кислота','холод','огонь','электричество','звук'].includes(damageType))return {ok:false,reason:'Неверная реакция «Поглощение стихий».'};
 const cast=canCastCheck(caster,sp);if(!cast.ok)return cast;
 if(!reactionCommitted&&combat.active&&!combatCanSpendPure('reaction',actorKey))return {ok:false,reason:'Реакция уже потрачена.'};
 const slot=slotPlanFor(caster,sp,String(slotLevel));if(!slot.ok)return slot;
 const material=materialPlanFor(caster,sp,cast.comp);if(!material.ok)return material;
 return {ok:true,caster,sp,slot,material,actorKey,slotLevel,damageType};
}
function artificerAbsorbDecisionKey(spec){const ti=spec?.meta?.target;return String(ti?.kind)+':'+String(ti?.id)+'|'+String(spec?.contract?.source?.id||spec?.meta?.recName||'')+'|'+arcanumTurnStamp();}
function artificerAbsorbPrepare(spec){
 if(!spec?.meta?.target?.obj||spec.meta.target.kind!=='ally'||!spec.rows.some(r=>r.type==='dmg')||!castCtx)return spec;
 const actorKey='ally:'+spec.meta.target.id,key=artificerAbsorbDecisionKey(spec);castCtx.artificerAbsorbChoices=castCtx.artificerAbsorbChoices||{};
 if(Object.prototype.hasOwnProperty.call(castCtx.artificerAbsorbChoices,key))return artificerAbsorbAugmentSpec(spec);
 const types=[...new Set(spec.rows.filter(r=>r.type==='dmg').map(r=>dmgTypeCanon(r.dmgType||spec.meta.dmgType)))].filter(t=>['кислота','холод','огонь','электричество','звук'].includes(t));
 const choices=[];for(const type of types)for(let level=1;level<=9;level++)if(artificerAbsorbCandidate(actorKey,level,type).ok)choices.push({value:{kind:'artificer-absorb',actorKey,slotLevel:level,damageType:type,label:'Поглощение стихий'},label:type+' · ячейка '+level+' круга'});
 if(!choices.length)return spec;
 const raw=window.prompt(spec.meta.target.name+': доступна реакция «Поглощение стихий». Она уменьшит вызывающий урон и потратит одну ячейку только при подтверждённом уроне.\n0. Не использовать\n'+choices.map((r,i)=>(i+1)+'. '+r.label).join('\n'),'0');
 if(raw==null)throw Error('cancelled');const n=Number(raw);if(!Number.isInteger(n)||n<0||n>choices.length)throw Error('Выберите номер реакции или 0.');
 castCtx.artificerAbsorbChoices[key]=n?choices[n-1].value:null;return artificerAbsorbAugmentSpec(spec);
}
function artificerAbsorbAugmentSpec(spec){if(!spec?.meta)return spec;const choice=castCtx?.artificerAbsorbChoices?.[artificerAbsorbDecisionKey(spec)];if(choice)spec.meta.artificerAbsorb=mechanicsClone(choice);return spec;}
function artificerAbsorbOutcome(spec,out){
 const u=spec?.meta?.artificerAbsorb;if(!u||!(out.dmgTotal>0)||!out.damageParts.some(p=>p.total>0&&dmgTypeCanon(p.type)===u.damageType))return out;
 const candidate=artificerAbsorbCandidate(u.actorKey,u.slotLevel,u.damageType);if(!candidate.ok){out.artificerAbsorbError=candidate.reason;return out;}
 if(out.reactionUses.some(r=>r.actorKey===u.actorKey)){out.artificerAbsorbError='Одной реакцией нельзя одновременно применить «Поглощение стихий» и другую защиту.';return out;}
 const target=mechanicsClone(spec.meta.target.obj);delete target.__fxC;target.activeFx=target.activeFx||[];target.activeFx.push({uid:'pending-absorb',k:'spell',id:candidate.sp.id,fx:[{stat:'damage.rule',mode:'grant',value:{mode:'resist',types:[u.damageType],when:''}}]});
 const old=out.dmgTotal;
 for(const part of out.damageParts){if(!(part.total>0)||dmgTypeCanon(part.type)!==u.damageType)continue;let amount=part.raw;
  if(out.saveOk===true){const mode=part.saveMode||(spec.meta.saveAffectsDamage===false?'always':spec.meta.half?'half':'zero');if(mode==='half')amount=Math.floor(amount/2);else if(mode==='zero')amount=0;}
  part.total=dmgAfterTraits(target,amount,part.type,spec.meta.damageTags||{}).amount;
 }
 out.dmgTotal=out.damageParts.reduce((n,p)=>n+p.total,0);out.reactionUses.push({...u,spellId:candidate.sp.id,amount:Math.max(0,old-out.dmgTotal)});
 out.verdict=out.verdict.filter(line=>!/^Итоговый урон|^У цели останется|^Герой падает|^Противник повержен|^⚠ Урон превышает/.test(line));out.verdict.push('Поглощение стихий: итоговый урон '+out.dmgTotal+'; реакция и одна ячейка '+u.slotLevel+' круга.');return out;
}
function artificerAbsorbReactionPlan(use){const p=artificerAbsorbCandidate(use.actorKey,use.slotLevel,use.damageType);if(!p.ok)return p;if(use.spellId!==p.sp.id)return {ok:false,reason:'Заклинание реакции изменилось.'};return {ok:true,kind:'artificer-absorb',u:use,...p};}
function artificerAbsorbReactionCommit(plan){
 const fresh=artificerAbsorbCandidate(plan.u.actorKey,plan.u.slotLevel,plan.u.damageType,true);if(!fresh.ok)throw Error(fresh.reason);commitSlotPlan(fresh.caster,fresh.slot);commitMaterialPlan(fresh.caster,fresh.material);
 artificerSpellEffect(fresh.actorKey,fresh.sp,fresh.caster,castUid(),[{stat:'damage.rule',mode:'grant',value:{mode:'resist',types:[fresh.damageType],when:''}}],{level:fresh.slotLevel,damageType:fresh.damageType,phase:'resist',expiresAtRound:fxRound+2});fxInvalidate();
}
function artificerAbsorbAttackSpec(spec){
 if(!spec?.meta?.caster||spec.meta.attackMode!=='melee'||!spec.rows.some(r=>r.type==='atk'))return spec;const caster=spec.meta.caster;
 for(const entry of artificerSpellEntries(caster)){const a=entry.artificerSpell;if(a.special!=='absorbElements'||a.phase!=='damage'||arcanumSuppressed(caster,entry))continue;
  const key='artificerAbsorbDamage';if(spec.rows.some(r=>r.key===key))continue;
  spec.rows.push({key,type:'dmg',side:'caster',cnt:a.level,sides:6,mod:0,dmgType:a.damageType,sourceUid:entry.uid,requiredOnHit:true,label:'Поглощение стихий: сумма '+a.level+'d6',artificerAbsorbUid:entry.uid});spec.meta.artificerAbsorbDamageUid=entry.uid;
 }return spec;
}
function artificerAbsorbAttackConsume(caster,rolls){if(rolls?.hit!==true||rolls.bg3InterruptFormula?.attack?.mode!=='melee')return;for(const entry of artificerSpellEntries(caster)){if(entry.artificerSpell.special==='absorbElements'&&entry.artificerSpell.phase==='damage')artificerSpellRemove(caster,entry);}}
function artificerSpellWeaponRollConsumed(caster,rolls,attackKind){if(attackKind!=='weapon'||typeof rolls?.hit!=='boolean')return;for(const entry of artificerSpellEntries(caster))if(entry.artificerSpell.special==='frostbite')artificerSpellRemove(caster,entry);}
function artificerSpellTurnStart(actorKey){
 try{
  const holder=combatActorByKey(actorKey);if(!holder)return true;const plans=[];
  for(const entry of artificerSpellEntries(holder)){const a=entry.artificerSpell,caster=getCh(entry.casterId),sp=spellOf(entry.id);if(!caster||!sp||arcanumSuppressed(holder,entry))continue;
   if(a.special==='causticBrew'&&a.lastStartStamp!==arcanumTurnStamp()){const spec=artificerSpellSpec(sp,caster,actorKey,a.level,{},'tick');plans.push({entry,rolls:artificerSpellResolved(spec,artificerSpellReadValues(spec))});}
  }
  for(const h of chars.concat(foesDB))for(const entry of artificerSpellEntries(h)){const a=entry.artificerSpell;if(a.special==='absorbElements'&&entry.casterId===holder.id){if(a.phase==='resist'){entry.fx=[];a.phase='damage';entry.combatUntilEndTurn=actorKey;entry.combatSkipMatchingEnd=false;}else artificerSpellRemove(h,entry);}}
  for(const h of chars.concat(foesDB))for(const entry of artificerSpellEntries(h))if(['boomingBlade','shockingGrasp','rayOfFrost'].includes(entry.artificerSpell.special)&&entry.combatUntilTurn===actorKey)artificerSpellRemove(h,entry);
  for(const p of plans){applyRollsToTarget(actorKey,p.rolls,p.entry.label,{sourceActorKey:'ally:'+p.entry.casterId});p.entry.artificerSpell.lastStartStamp=arcanumTurnStamp();}
  if(plans.length)artificerSpellRefresh();return true;
 }catch(error){setStatus(error.message==='cancelled'?'Сначала введите периодический урон; начало хода отменено.':error.message,true);return false;}
}
function artificerSpellControls(holder){
 const key=(foesDB.includes(holder)?'foe:':'ally:')+holder.id,buttons=[];
 for(const entry of artificerSpellEntries(holder)){const s=entry.artificerSpell.special,actions=s==='causticBrew'?[['wash','Смыть кислоту — действие']]:s==='boomingBlade'?[['move','Переместиться на 5 футов']]:s==='magicStone'?[['stone','Бросить волшебный камень']]:s==='createBonfire'?[['bonfire','Существо входит в костёр']]:s==='snare'?(entry.artificerSpell.trapped?[['escape','Освободиться из силка — действие']]:entry.artificerSpell.armed?[['snare','Существо входит в силок']]:[]):[];
  for(const [action,label] of actions)buttons.push('<button type="button" class="btn ghost sm" onclick="artificerSpellEventOpen('+esc(JSON.stringify(key))+','+esc(JSON.stringify(entry.uid))+','+esc(JSON.stringify(action))+')">'+esc(label)+'</button>');
  if(s==='featherFall')buttons.push('<button type="button" class="btn ghost sm" onclick="artificerSpellEventOpen('+esc(JSON.stringify(key))+','+esc(JSON.stringify(entry.uid))+',&quot;land&quot;)">Приземлиться без урона</button>');
 }
 const objects=artificerSceneObjects().filter(row=>row.casterId===holder.id);if(objects.length)buttons.push('<details><summary>Предметы в сцене · огонь</summary>'+objects.slice(-20).map(row=>'<p>'+esc(row.data.label)+' · КД '+row.data.ac+' · '+row.data.hp+' хитов'+(row.data.burning?' · горит <button type="button" class="btn ghost sm" onclick="artificerSpellEventOpen('+esc(JSON.stringify(key))+','+esc(JSON.stringify(row.id))+',&quot;extinguish&quot;)">Отметить потушенным</button>':' · не горит')+'</p>').join('')+'<p>Дальнейшее течение пожара определяет мастер; периодический урон не назначен.</p></details>');
 const collisions=(bg3SceneState.spellEffects||[]).filter(row=>row.casterId===holder.id&&row.data?.type==='artificerCatapultObject');if(collisions.length)buttons.push('<details><summary>Предметы в сцене · Катапульта</summary>'+collisions.slice(-10).map(row=>'<p>'+esc(row.data.label)+' · '+row.data.weightLb+' фнт · '+row.data.hp+'/'+row.data.hpBefore+' хитов · урон '+row.data.damage+' · раунд '+row.appliedRound+'</p>').join('')+'</details>');
 return buttons.join('');
}
function artificerSpellEventOpen(holderKey,uid,action){if(action==='extinguish')return artificerSceneExtinguish(holderKey,uid);return combatTransitionCommit(()=>artificerSpellEventPerform(holderKey,uid,action));}
async function artificerSceneExtinguish(holderKey,id){
 try{
  const initial=artificerSceneObjects().find(row=>row.id===id),casterId=String(holderKey).startsWith('ally:')?String(holderKey).slice(5):'',token=initial&&JSON.stringify(initial.data);if(!initial||initial.casterId!==casterId||!initial.data.burning)throw Error('Горящий предмет уже изменился.');
  if(!artificerSpellBool('Мастер подтверждает: пожар у «'+initial.data.label+'» уже погашен в сцене'))return {success:false,message:'Отметка не изменена.'};
  return await arcanumAction('artificer-object-extinguish:'+id,()=>{const row=artificerSceneObjects().find(r=>r.id===id);return row&&row.casterId===casterId&&JSON.stringify(row.data)===token?{ok:true,row}:{ok:false,reason:'Состояние предмета изменилось; повторите подтверждение.'};},plan=>{plan.row.data.burning=false;plan.row.data.extinguishedRound=fxRound;bg3SceneState.revision=(+bg3SceneState.revision||0)+1;castLogLine(plan.row.data.label+': мастер подтвердил, что пожар погашен.');});
 }catch(error){const message=error.message==='cancelled'?'Отметка не изменена.':error.message;setStatus(message,true);return {success:false,message};}
}
function artificerMagicStoneAttack(owner,entry,caster,sp){
 const a=entry.artificerSpell,actorKey=artificerSpellChoose('Кто атакует волшебным камешком',chars.map(h=>({value:'ally:'+h.id,label:h.name}))),actor=combatActorByKey(actorKey);
 if(!(a.stones>0))throw Error('Камешки закончились.');
 const blocked=ACTION_BLOCK_CONDS.find(condition=>effectiveConditions(actor).includes(condition));if(blocked)throw Error('Состояние «'+blocked+'» не позволяет атаковать.');
 if(combat.active&&!combatCanSpendPure('attack',actorKey))throw Error('Нет доступной атаки.');
 const mode=artificerSpellChoose('Способ атаки',[{value:'throw',label:'Бросок рукой — до 60 футов'},{value:'sling',label:'Выстрел из пращи — 30/120 футов'}]);
 if(!artificerSpellBool('Зачарованный камешек передан атакующему'))return false;
 let sling=null;if(mode==='sling'){
  sling=['MAIN_HAND','OFF_HAND'].map(slot=>invEntryOf(actor,actor.equipment?.[slot])).find(e=>e?.qty>0&&itemProfile(itemOf(e.itemId)).weapon?.ammoType==='праща');
  if(!sling||!weaponCanUseTwoHands(actor,sling.id))throw Error('Нужно держать пращу в одной руке, а другую освободить для заряжания камешка.');
 }else if(!freeHandInfo(actor).free)throw Error('Освободите руку, чтобы бросить камешек.');
 const previous=castCtx;castCtx={kind:'spell',spellId:sp.id,casterId:actor.id,combatActorKey:actorKey,combatCost:'attack',sanctuaryChecks:{}};
 try{while(true){
  const target=artificerSpellChoose('Цель',chars.concat(foesDB).map(h=>({value:(foesDB.includes(h)?'foe:':'ally:')+h.id,label:h.name||h.n}))),distanceM=artificerSpellNumber('Расстояние до цели в метрах',0),range=mode==='sling'?'30/120 футов':'60 футов',rangeBand=attackRangeBandAt(attackRangeBands(range),distanceM);
  if(rangeBand==='out')throw Error('Цель находится дальше максимальной дистанции.');
  const cover=artificerSpellChoose('Укрытие цели',[{value:'none',label:'Без укрытия'},{value:'half',label:'Половинное укрытие (+2 КД)'},{value:'threeQuarters',label:'Укрытие на три четверти (+5 КД)'},{value:'total',label:'Полное укрытие'}]);if(cover==='total')throw Error('Полное укрытие не позволяет атаковать.');
  const threatenedWithin5=artificerSpellBool('Рядом с атакующим (в пределах 5 футов) есть видящий его дееспособный враг');
  const gate=artificerSanctuaryPrompt(actor,target,castCtx.sanctuaryChecks);if(!gate.ok)throw Error(gate.reason);
  if(gate.needed&&!gate.passed){
   if(artificerSpellChoose('Убежище не позволило атаковать цель',[{value:'retarget',label:'Выбрать другую цель этой же атаки'},{value:'lose',label:'Потратить попытку, сохранив камешек'}])==='retarget')continue;
   const plans=[],excluded=[];for(const key of Object.keys(castCtx.sanctuaryChecks)){const p=artificerSanctuaryPlan(actor,key,castCtx.sanctuaryChecks[key],excluded.slice());if(!p.ok||!p.needed)throw Error(p.reason||'Защита цели изменилась.');plans.push(p);excluded.push(...p.spec.save.consumeTargetFx.filter(uid=>!excluded.includes(uid)));}
   if(combat.active&&!combatSpend('attack','Попытка потеряна: Убежище',actorKey))return false;artificerSanctuaryCommitPlan({plans});castLogLine(actor.name+': Убежище — попытка потеряна; камешек сохранён, атака не совершена.');return true;
  }
  const rec=artificerSpellRecord(sp,caster,0),spec=structuredRollSpecOf(rec,{kind:'spell',caster:actor,target:targetInfoOf(target),range,rangeBand,distanceM,within5:distanceM<=1.524,cover,threatenedWithin5}),atk=spec.rows.find(r=>r.type==='atk'),dmg=spec.rows.find(r=>r.type==='dmg');
  atk.mod+=eMod(caster,spellAbOf(caster))-eMod(actor,spellAbOf(actor));dmg.mod=eMod(caster,spellAbOf(caster));
  if(sling){const bonus=artificerWeaponBonus(actor,sling.id,weaponBonusOf(itemOf(sling.itemId)));atk.mod+=bonus.atk;dmg.mod+=bonus.dmg;}
  finalizeRollSpec(spec,spec.contract.source);const values=artificerSpellReadValues(spec),rolls=artificerSpellResolved(spec,values);
  if(!preflightOutcomeReactions(rolls,target,false))return false;
  if(combat.active&&!combatSpend('attack','Волшебный камень',actorKey))return false;
  artificerSanctuaryCommitAttack(actor,target,rolls);if(!commitOutcomeReactions(rolls))throw Error('Защитная реакция изменилась.');a.stones--;
  consumeOutcomeRollFx(actor,target,rolls,targetInfoOf(target),'spell');endTriggeredSpellEffects(actor,'attack');applyRollsToTarget(target,rolls,sp.n,{sourceActorKey:actorKey});
  if(a.stones<=0)artificerSpellRemove(owner,entry);castLogLine(actor.name+': Волшебный камень'+(sling?' из пращи':'')+' → '+targetInfoOf(target).name+'; '+(rolls.hit?'попадание, '+rolls.dmgTotal+' урона':'промах')+'; осталось камешков '+a.stones+'.');return true;
 }}finally{castCtx=previous;}
}
function artificerSpellEventPerform(holderKey,uid,action){
 try{
  const owner=combatActorByKey(holderKey),entry=owner?.activeFx?.find(e=>e.uid===uid),a=entry?.artificerSpell,caster=entry&&getCh(entry.casterId),sp=entry&&spellOf(entry.id);if(!a||!caster||!sp)throw Error('Эффект уже закончился.');
  if(arcanumSuppressed(owner,entry))throw Error('Эффект подавлен антимагией.');
  let actorKey=holderKey,target=holderKey,spec,values,rolls;
  if(action==='land'){if(a.special!=='featherFall'||!artificerSpellBool('Существо достигло земли до окончания плавного падения'))return false;artificerFeatherLanded(owner);castLogLine(targetInfoOf(holderKey).name+': приземление без урона; плавное падение завершено.');}
  else if(action==='wash'){actorKey=artificerSpellChoose('Кто смывает кислоту',chars.concat(foesDB).map(h=>({value:(foesDB.includes(h)?'foe:':'ally:')+h.id,label:h.name||h.n})));if(actorKey!==holderKey&&!artificerSpellBool('Помощник может дотянуться до цели'))return false;if(combat.active&&!combatCanSpendPure('action',actorKey))throw Error('У помощника нет действия.');if(combat.active&&!combatSpend('action','Смыть кислоту',actorKey))return false;artificerSpellRemove(owner,entry);}
  else if(action==='move'){if(!artificerSpellBool('Это добровольное перемещение минимум на 5 футов, не толчок и не телепортация'))return false;spec=artificerSpellSpec(sp,caster,target,a.level,{},'move');values=artificerSpellReadValues(spec);rolls=artificerSpellResolved(spec,values);applyRollsToTarget(target,rolls,sp.n,{sourceActorKey:'ally:'+caster.id});artificerSpellRemove(owner,entry);}
  else if(action==='stone'){if(!artificerMagicStoneAttack(owner,entry,caster,sp))return false;}
  else if(action==='escape'){
   actorKey=artificerSpellChoose('Кто освобождает цель',chars.concat(foesDB).map(h=>({value:(foesDB.includes(h)?'foe:':'ally:')+h.id,label:h.name||h.n})));if(actorKey!==holderKey&&!artificerSpellBool('Помощник находится в пределах касания'))return false;if(combat.active&&!combatCanSpendPure('action',actorKey))throw Error('Нет свободного действия.');
   const actor=targetInfoOf(actorKey),index=SKILLS.findIndex(row=>row[0]==='Магия'),mod=actor.kind==='ally'?skillBonus(actor.obj,index).v:actor.skillMod('Магия');spec=finalizeRollSpec({rows:[{key:'chk',type:'check',side:'caster',natural:true,mod,adv:0,checkKind:'skill.Магия',label:'Интеллект (Магия): d20 '+fmtMod(mod)}],meta:{caster:actor.obj,target:targetInfoOf(holderKey),kind:'ability'}},{kind:'ability',id:'snare-escape',name:'Освободиться из силка'});values=artificerSpellReadValues(spec);const check=pickNat(values,'chk',spec.rows[0].adv)+spec.rows[0].mod;if(combat.active&&!combatSpend('action','Освободиться из силка',actorKey))return false;if(check>=spellDC(caster)){removeCastGroup(entry.castId);}castLogLine('Освобождение из силка: '+check+' против СЛ '+spellDC(caster)+'.');
  }else if(action==='bonfire'||action==='snare'){
   target=artificerSpellChoose('Затронутое существо',chars.concat(foesDB).map(h=>({value:(foesDB.includes(h)?'foe:':'ally:')+h.id,label:h.name||h.n})));if(!artificerSpellBool('Существо находится внутри области эффекта'))return false;
   const stamp=arcanumTurnStamp(),receipt=stamp+':enter:'+target;if(action==='bonfire'&&(a.receipts?.[receipt]||!artificerSpellBool('Это первое вхождение в костёр за этот ход')))return false;
   if(action==='snare'&&(!a.armed||![1,2,3].includes(recipeTabletopSize(targetInfoOf(target).obj).rank)))throw Error('Силок уже сработал либо размер цели неподходящий.');
   spec=artificerSpellSpec(sp,caster,target,a.level);values=artificerSpellReadValues(spec);rolls=artificerSpellResolved(spec,values);applyRollsToTarget(target,rolls,sp.n,{sourceActorKey:'ally:'+caster.id});
   if(action==='bonfire'){a.receipts=a.receipts||{};a.receipts[receipt]=true;}
   if(action==='snare'&&rolls.saveOk===false){a.armed=false;const fx=artificerSpellEffect(target,sp,caster,entry.castId,[{stat:'condition',mode:'text',value:'Опутанный'}],{level:a.level,trapped:true,expiresAtRound:entry.expiresAtRound});fx.repeatSave={when:'end',key:'dex',dc:spellDC(caster),magic:true};fx.arcanumRepeat=true;artificerSpellRemove(owner,entry);}
   else if(action==='snare'&&rolls.saveOk===true)removeCastGroup(entry.castId);
  }else throw Error('Неизвестное действие.');
  artificerSpellRefresh();return true;
 }catch(error){setStatus(error.message==='cancelled'?'Действие отменено.':error.message,true);return false;}
}
// Sanctuary is a target permission check, before the attack itself. Losing the
// attempt consumes the action, but never invents an attack die or spends ammo.
function artificerSanctuaryEntry(holder){return artificerSpellEntries(holder).filter(e=>e.artificerSpell.special==='sanctuary'&&!arcanumSuppressed(holder,e)).sort((a,b)=>b.artificerSpell.dc-a.artificerSpell.dc)[0]||null;}
function artificerSanctuaryBreak(holder){const entries=artificerSpellEntries(holder).filter(entry=>entry.artificerSpell.special==='sanctuary');if(!entries.length)return;for(const entry of entries)artificerSpellRemove(holder,entry);fxInvalidate();}
function artificerSanctuarySpellHarmful(sp,input){const m=currentMechanics(sp,'spell'),s=artificerSpellSpecial(sp);return !!(sp.grimoire?.english==='Light'&&input?.artificerUtility?.unwilling===true||sp.artificerSpell?.attack||sp.artificerSpell?.die||['boomingBlade','greenFlameBlade','causticBrew','snare'].includes(s)||m?.resolution?.attack||m?.resolution?.rolls?.some(r=>r.type==='dmg')||m?.resolution?.save&&!m?.resolution?.rolls?.some(r=>['heal','temp'].includes(r.type))||m?.target?.kind==='enemy'||m?.effects?.some(f=>f.stat==='condition'&&!['Невидимый'].includes(f.value)));}
function artificerSanctuarySpellArea(sp){return !!(sp.grimoire?.english==='Grease'||sp.artificerSpell?.area||['causticBrew','createBonfire'].includes(artificerSpellSpecial(sp))||spellRuleOf(sp)?.targeting?.area||currentMechanics(sp,'spell')?.target?.area);}
function artificerSanctuarySpellTargets(sp,targets,input){return sp.grimoire?.english==='Light'&&input?.artificerUtility?.unwilling?[input.artificerUtility.holderKey]:targets;}
function artificerSanctuarySpellAffectsEnemy(sp,caster,targets,input){return artificerSanctuarySpellTargets(sp,targets,input).some(value=>spellTargetKindFor(caster,value)==='enemy');}
function artificerSanctuarySaveSpec(actor,dc,excluded=[]){
 const actorKey=(foesDB.includes(actor)?'foe:':'ally:')+actor.id,ti=targetInfoOf(actorKey),base=['save.wis','save.all'],all=ti.kind==='ally'?rollFxEntries(actor,'save.wis',['magical']):holderFxEntries(actor).filter(f=>['save','save.wis','save.all','save.magical'].includes(f.stat)),fx=all.filter(f=>!excluded.includes(f.sourceUid)),mode=saveConditionMode(ti,'wis',{magic:true});
 const adv=mode.adv||fx.some(f=>f.mode==='adv'),dis=mode.dis||fx.some(f=>f.mode==='dis'),save={rowKey:'sanctuary_save',mod:ti.saveMod('wis')-all.filter(f=>excluded.includes(f.sourceUid)&&base.includes(f.stat)&&f.mode==='add').reduce((n,f)=>n+(+f.value||0),0)+fx.filter(f=>!base.includes(f.stat)&&f.mode==='add').reduce((n,f)=>n+(+f.value||0),0),adv:adv===dis?0:adv?1:2,autoFail:mode.autoFail,dice:[],consumeTargetFx:[...new Set(fx.filter(f=>f.consume==='roll'&&f.sourceUid).map(f=>f.sourceUid))]};
 const rows=[{key:save.rowKey,label:'Мудрость: d20 '+fmtMod(save.mod)+' против СЛ '+dc,min:1,max:20}];if(save.adv)rows.push({key:save.rowKey+'_2',label:'Второй d20: '+(save.adv===1?'преимущество':'помеха'),min:1,max:20});
 fx.filter(f=>f.mode==='die').forEach((f,i)=>{const d=normDiceInput(String(f.value)).match(/^(-)?(\d*)d(\d+)$/);if(!d)return;const key='sanctuary_bonus'+i,count=+d[2]||1,sides=+d[3];rows.push({key,label:(f.label||'Эффект спасброска')+': '+f.value,min:count,max:count*sides});save.dice.push({key,sign:d[1]?-1:1});});
 return {ti,save,rows,total:values=>save.autoFail?null:pickNat(values,save.rowKey,save.adv)+save.mod+save.dice.reduce((n,d)=>n+values[d.key]*d.sign,0),token:JSON.stringify({actorKey,dc,excluded,save,rows})};
}
function artificerSanctuaryPlan(actor,target,proof,excluded=proof?.excluded||[]){
 const entry=artificerSanctuaryEntry(targetInfoOf(target).obj);if(!entry)return {ok:true,needed:false};
 if(!actor)return {ok:false,reason:'Нужно определить нападающего для спасброска против «Убежища».'};
 const actorKey=(foesDB.includes(actor)?'foe:':'ally:')+actor.id,dc=entry.artificerSpell.dc,spec=artificerSanctuarySaveSpec(actor,dc,excluded);
 if(!proof||proof.effectUid!==entry.uid||proof.actorKey!==actorKey||proof.target!==target||proof.token!==spec?.token)return {ok:false,reason:'«Убежище»: сначала введите спасбросок Мудрости нападающего; цель или формула изменились.'};
 if(spec.rows.some(r=>!Number.isInteger(proof.values?.[r.key])||proof.values[r.key]<r.min||proof.values[r.key]>r.max))return {ok:false,reason:'«Убежище»: нужны все реальные кости спасброска Мудрости.'};
 return {ok:true,needed:true,actor,actorKey,entry,proof,spec,excluded,passed:!spec.save.autoFail&&spec.total(proof.values)>=dc};
}
function artificerSanctuaryPrompt(actor,target,map){
 const entry=artificerSanctuaryEntry(targetInfoOf(target).obj);if(!entry)return {ok:true,needed:false};
 const existing=artificerSanctuaryPlan(actor,target,map[target]);if(existing.ok)return existing;
 const actorKey=(foesDB.includes(actor)?'foe:':'ally:')+actor.id,prior=Object.values(map).filter(p=>p.target!==target),excluded=[...new Set(prior.flatMap(p=>artificerSanctuaryPlan(actor,p.target,p).spec?.save.consumeTargetFx||[]))],spec=artificerSanctuarySaveSpec(actor,entry.artificerSpell.dc,excluded),values={};
 for(const row of spec.rows)values[row.key]=artificerSpellNumber('Убежище — '+(actor.name||actor.n)+': '+row.label,row.min,row.max,true);
 map[target]={effectUid:entry.uid,actorKey,target,token:spec.token,values,excluded};return artificerSanctuaryPlan(actor,target,map[target]);
}
function artificerSanctuaryCollect(sp,targets,input){
 try{if(!artificerSanctuarySpellHarmful(sp,input)||artificerSanctuarySpellArea(sp))return {ok:true,input};const actor=getCh(castCtx?.casterId);if(!actor)return {ok:true,input};targets=artificerSanctuarySpellTargets(sp,targets,input);input.sanctuary=input.sanctuary||castCtx?.sanctuaryChecks||{};delete input.sanctuaryLost;
 for(const target of targets){const plan=artificerSanctuaryPrompt(actor,target,input.sanctuary);if(!plan.ok)return plan;if(plan.needed&&!plan.passed){const choice=artificerSpellChoose('Убежище: спасбросок провален. Выберите другую цель либо потеряйте заклинание (ячейка и действие будут потрачены).',[{value:'retarget',label:'Вернуться к выбору цели'},{value:'lose',label:'Потратить заклинание без последствий'}]);if(choice==='retarget'){castCtx.sanctuaryChecks=input.sanctuary;return {ok:false,reason:'Убежище не позволило выбрать эту цель. Выберите другую цель.'};}input.sanctuaryLost=true;break;}}
 castCtx.sanctuaryChecks=input.sanctuary;return {ok:true,input};
 }catch(error){return {ok:false,cancelled:error.message==='cancelled',reason:error.message==='cancelled'?'Проверка Убежища отменена; ресурс не потрачен.':error.message};}
}
function artificerSanctuarySpellPreflight(sp,caster,targets,input){
 if(!artificerSanctuarySpellHarmful(sp,input)||artificerSanctuarySpellArea(sp))return {ok:true,plans:[],lost:false};targets=artificerSanctuarySpellTargets(sp,targets,input);const plans=[];
 const checks={...(castCtx?.sanctuaryChecks||{}),...(input?.sanctuary||{})},excluded=[];for(const target of [...new Set(Object.keys(checks).concat(targets))]){const plan=artificerSanctuaryPlan(caster,target,checks[target],excluded.slice());if(!plan.ok)return plan;if(checks[target]&&!plan.needed)return {ok:false,reason:'Убежище на предыдущей цели изменилось; повторите выбор действия.'};if(plan.needed){plans.push(plan);excluded.push(...plan.spec.save.consumeTargetFx.filter(uid=>!excluded.includes(uid)));}}
 const failed=plans.some(p=>targets.includes(p.proof.target)&&!p.passed);if(failed&&input?.sanctuaryLost!==true)return {ok:false,reason:'Убежище: смените цель либо подтвердите потерю заклинания.'};if(input?.sanctuaryLost&&!failed)return {ok:false,reason:'Причина потери заклинания изменилась; повторите выбор цели.'};return {ok:true,plans,lost:failed};
}
function artificerSanctuarySpecInfo(spec){
 if(spec?.meta?.artificerOngoingDamage)return null;
 const ti=spec?.meta?.target;if(!ti?.obj||!artificerSanctuaryEntry(ti.obj))return null;
 const actor=spec.meta.caster||(castCtx?.foeId&&foeOf(castCtx.foeId))||foesDB.find(f=>String(spec.contract?.source?.id||'').startsWith(f.id+':'));if(!actor)return null;
 const sp=spellOf(castCtx?.spellId||spec.contract?.source?.id),foe=foesDB.includes(actor),action=foe&&foeActionsOf(actor).find(a=>String(spec.contract?.source?.id||'')===actor.id+':'+a.id);
 const attack=spec.rows.some(r=>r.type==='atk'),hostileLight=sp?.grimoire?.english==='Light'&&castCtx?.sanctuaryChecks?.[ti.kind+':'+ti.id];if(sp&&artificerSanctuarySpellArea(sp)||action?.area||!attack&&!(sp&&artificerSanctuarySpellHarmful(sp))&&!hostileLight)return null;
 return {actor,target:ti.kind+':'+ti.id,sp,action,attack};
}
function artificerSanctuaryPrepareSpec(spec){
 const info=artificerSanctuarySpecInfo(spec);if(!info)return true;if(!castCtx)throw Error('Откройте действие для проверки Убежища.');
 castCtx.sanctuaryChecks=castCtx.sanctuaryChecks||{};const plan=artificerSanctuaryPrompt(info.actor,info.target,castCtx.sanctuaryChecks);if(!plan.ok)throw Error(plan.reason);if(plan.passed)return true;
 const choice=artificerSpellChoose('Убежище: спасбросок провален. Атака ещё не совершена.',[{value:'retarget',label:'Вернуться к выбору другой цели'},{value:'lose',label:'Потратить попытку без атаки и боеприпаса'}]);
 if(choice==='retarget'){castModalResetActionView();castShowErr('Убежище не позволило атаковать эту цель. Выберите другую.');return false;}
 const cost=castCtx.combatCost||(info.action?.cost||'attack'),actorKey=(foesDB.includes(info.actor)?'foe:':'ally:')+info.actor.id;
 if(combat.active&&!combatCanSpendPure(cost,actorKey))throw Error('Нет действия для этой попытки.');
 if(!combatTransitionCommit(()=>{const plans=[],excluded=[];for(const key of Object.keys(castCtx.sanctuaryChecks)){const fresh=artificerSanctuaryPlan(info.actor,key,castCtx.sanctuaryChecks[key],excluded.slice());if(!fresh.ok||!fresh.needed||key===info.target&&fresh.passed)return false;plans.push(fresh);excluded.push(...fresh.spec.save.consumeTargetFx.filter(uid=>!excluded.includes(uid)));}if(combat.active&&!combatSpend(cost,'Попытка потеряна: Убежище',actorKey))return false;artificerSanctuaryCommitPlan({plans});castLogLine((info.actor.name||info.actor.n)+': Убежище — попытка потеряна, атака не совершена.');return true;}))throw Error('Не удалось учесть потерянную попытку.');
 closeCastModal();scheduleSave();renderCombat();return false;
}
function artificerSanctuaryOutcome(spec,out){const info=artificerSanctuarySpecInfo(spec);if(!info)return out;const p=artificerSanctuaryPlan(info.actor,info.target,castCtx?.sanctuaryChecks?.[info.target]);if(!p.ok||p.needed&&!p.passed)out.artificerSanctuaryError=p.reason||'Убежище не позволило выбрать эту цель.';return out;}
function artificerSanctuaryCommitPlan(plan){const checked=[];for(const p of plan?.plans||[]){const fresh=artificerSanctuaryPlan(p.actor,p.proof.target,p.proof,p.excluded);if(!fresh.ok||fresh.passed!==p.passed)throw Error(fresh.reason||'Спасбросок Убежища изменился.');checked.push(fresh);}for(const p of checked)arcanumConsumeSaveFx(p.actor,p.spec.save.consumeTargetFx||[]);}
function artificerSanctuaryCommitAttack(actor,target,rolls){if(!actor||!rolls?.attackMade)return;const checks=castCtx?.sanctuaryChecks||{},plans=[],excluded=[];for(const key of [...new Set(Object.keys(checks).concat(target))]){const p=artificerSanctuaryPlan(actor,key,checks[key],excluded.slice());if(!p.ok||p.needed&&key===target&&!p.passed)throw Error(p.reason||'Убежище блокирует цель.');if(p.needed){plans.push(p);excluded.push(...p.spec.save.consumeTargetFx.filter(uid=>!excluded.includes(uid)));}}artificerSanctuaryCommitPlan({plans});}

import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
function world(key){
 const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});e.economyApi.quiet();e.artificerSpellApi.quiet();e.partyStarterApi.ensureCatalogs();
 const built=e.partyStarterApi.prepare();assert.equal(built.ok,true,built.reason);const c=built.character,t=Object.assign(e.buildBlank(),{id:'observer',name:'Наблюдатель',hp:10,hpMax:10});
 e.setState({...e.state(),chars:[c,t],activeCharId:c.id});const a=e.artificerUtilityApi,sp=e.state().spells.find(s=>e.grimoireApi.grimoireActive(s)&&a.definition(s)?.key===key);assert.ok(sp,key);a.reconcile(sp);
 c.spellbook=[{spellId:sp.id,prep:true,access:sp.l?'prepared':'cantrip',granted:true,alwaysPrepared:true,countsAgainstPreparation:false}];e.guardRandom();
 const u={key,scene:'Предмет на столе',distanceM:0,clearPath:true,minutesCompleted:true,touch:true,
  light:{sizeM:0.1,color:'белый',unwilling:false},dancingLights:{count:4,connected:true,shape:'кольцо'},message:{recipient:'Страж',message:'Пропустите нас',reply:'Назовите пароль',targetKnown:true,barrierBlocked:false},
  prestidigitation:{mode:'warm',cubicFeet:1,details:'Кружка чая подогрета'},mageHand:{location:'Над столом'},mending:{breakM:0.1,singleBreak:true,details:'Разрыв плаща соединён'},detectMagic:{presence:true},
  disguiseSelf:{heightDeltaM:0.2,sameBody:true,details:'Путешественница в синем'},identify:{targetKind:'item',details:'Мастер: предмет немагический; заряды и настройка отсутствуют',inventoryEntryId:''},purifyFoodDrink:{nonmagicalFood:true,radiusM:1},alarm:{areaSideM:6,mode:'mental',excluded:['Лиора']}};
 const facts=u[key];for(const k of ['light','dancingLights','message','prestidigitation','mageHand','mending','detectMagic','disguiseSelf','identify','purifyFoodDrink','alarm'])delete u[k];Object.assign(u,facts);
 return {e,a,c,t,sp,input:{artificerUtility:u}};
}
function apply(w,slot=String(w.sp.l)){return w.e.castSpellApply(w.sp.id,w.c.id,'none','',undefined,slot,null,[],{},w.input);}
function preflight(w,payment={mode:'slot'}){return w.a.preflight(w.sp,w.c,['none'],w.sp.l,null,{},w.input,payment);}

test('all eleven utility contracts are structured and reject missing scene facts before any mutation',()=>{
 const w=world('light'),covered=w.e.state().spells.filter(s=>w.e.grimoireApi.grimoireActive(s)&&w.a.definition(s));assert.equal(covered.length,11);
 for(const sp of covered){w.a.reconcile(sp);assert.equal(sp.mechanics.mode,'structured',sp.n);assert.deepEqual(plain(w.e.abilitiesApi.mechanicsErrors(sp.mechanics,'spell')),[],sp.n);const before=plain(w.e.state().chars);assert.equal(w.a.preflight(sp,w.c,['none'],sp.l,null,{},{}).ok,false);assert.deepEqual(plain(w.e.state().chars),before);}
 for(const changed of [{custom:true},{catalogSource:{documentKey:'srd-2024'}},{mechanics:{origin:'editor'}}])assert.equal(w.a.definition({...w.sp,...changed}),null);
});

test('registered observers spend their own action and enter physical investigation dice against the original disguise DC',async()=>{
 const w=world('disguiseSelf');assert.equal(apply(w),true);const entry=w.a.entries(w.c)[0],dc=entry.artificerUtility.saveDc;w.c.ab.int=20;
 w.e.setState({...w.e.state(),combat:{...w.e.blankCombat(),active:true,id:'inspection',order:[{kind:'ally',id:w.t.id,initiative:20},{kind:'ally',id:w.c.id,initiative:10}],turnIndex:0,turn:{actorKey:'ally:'+w.t.id,actionsUsed:0,actionMax:1}}});
 const input={observer:w.t.name,observerKey:'ally:'+w.t.id,physical:false,natural:[dc],bonusDice:[]};const result=await w.a.action(w.c.id,entry.uid,'inspect',input);assert.equal(result.success,true,result.message);assert.equal(w.e.state().combat.turn.actionsUsed,1);assert.match(w.c.artificerUtilityHistory.at(-1).result,/распознал иллюзию/);assert.equal((await w.a.action(w.c.id,entry.uid,'inspect',input)).success,false);
});

test('mental alarm wakes confirmed ordinary sleep without removing magical unconsciousness or restoring dying HP',async()=>{
 const w=world('alarm');assert.equal(apply(w),true);const entry=w.a.entries(w.c)[0],input={creature:'Гоблин',tinyOrLarger:true,entered:true,casterDistanceM:10,ordinarySleep:true};
 w.c.cond=['Бессознательный'];assert.equal((await w.a.action(w.c.id,entry.uid,'alarm',input)).success,true);assert.equal(w.c.cond.includes('Бессознательный'),false);
 w.c.cond=['Бессознательный'];w.c.activeFx.push({uid:'magical-sleep',id:'sleep-effect',label:'Магический сон',k:'spell',fx:[{stat:'condition',mode:'text',value:'Бессознательный'}]});const sleeping=await w.a.action(w.c.id,entry.uid,'alarm',input);assert.equal(sleeping.success,true,sleeping.message);assert.equal(w.c.cond.includes('Бессознательный'),true);assert.ok(w.c.activeFx.some(e=>e.uid==='magical-sleep'));
 w.c.activeFx=w.c.activeFx.filter(e=>e.uid!=='magical-sleep');w.c.hp=0;assert.equal((await w.a.action(w.c.id,entry.uid,'alarm',input)).success,true);assert.equal(w.c.hp,0);assert.equal(w.c.cond.includes('Бессознательный'),true);
});

test('a scene range event ends Mage Hand without charging another action',async()=>{
 const w=world('mageHand');assert.equal(apply(w),true);const entry=w.a.entries(w.c)[0];assert.equal((await w.a.action(w.c.id,entry.uid,'range',{distanceM:12})).success,true);assert.equal(w.a.entries(w.c).length,0);
});

test('Detect Magic uses a real slot, concentration, explicit aura actions and shared effect expiry',async()=>{
 const w=world('detectMagic'),before=w.c.slots[1].cur;assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.c.slots[1].cur,before-1);const entry=w.a.entries(w.c)[0];assert.ok(entry.conc);assert.equal(entry.expiresAtRound,w.e.state().fxRound+100);
 const bad=await w.a.action(w.c.id,entry.uid,'aura',{distanceM:10,visible:true,blocked:false,details:'Аура иллюзии'});assert.equal(bad.success,false);assert.equal(entry.artificerUtility.details,undefined);
 const good=await w.a.action(w.c.id,entry.uid,'aura',{distanceM:5,visible:true,blocked:false,details:'Мастер: аура иллюзии на двери'});assert.equal(good.success,true,good.message);assert.match(w.c.artificerUtilityHistory.at(-1).result,/иллюзии/);
 w.a.breakConcentration(w.c,'проверка');assert.equal(w.a.entries(w.c).length,0);
});

test('legacy utility reconciliation preserves class availability and Detect Magic scroll consumes one item with concentration',()=>{
 const e=loadRuntimeIntegrationEngine(undefined,{openDnd5eCatalog:false});e.setState({...e.catalogs});e.economyApi.quiet();e.artificerSpellApi.quiet();e.guardRandom();
 const legacy=e.state().spells.filter(sp=>e.artificerUtilityApi.definition(sp));assert.ok(legacy.length>=5);
 for(const sp of legacy){assert.equal(e.grimoireApi.grimoireActive(sp),true,sp.n);assert.equal(sp.grimoire,undefined,'a runtime revision must not invent catalog visibility: '+sp.n);}
 const it=e.state().items.find(row=>row.id==='it_scroll_detect_magic'),use=e.itemUsesOf(it)[0],sp=e.grimoireApi.spellOf(use.scroll.spellId);
 const c=Object.assign(e.buildBlank(),{id:'legacy-bard',name:'Чтец свитка',cls:'Бард',level:3,inventory:[{id:'scroll',itemId:it.id,qty:2}],equipment:{},activeFx:[],slots:{1:{cur:3,max:3}}});
 e.setState({...e.state(),chars:[c],activeCharId:c.id});const key='ally:'+c.id,opts={distanceM:0,willingConfirmed:true},slots=plain(c.slots);
 const spec=e.itemUseSpecOf(c,it,use,e.targetInfoOf(key),opts),values=e.itemAuditRollValues(spec),out=e.resolveOutcome(spec,values,{});assert.equal(e.validateFormulaValues(spec,values,out).ok,true);
 assert.equal(e.useItemApply('scroll',c.id,'',out,use.id,opts),false);assert.equal(c.inventory[0].qty,2);assert.equal(c.activeFx.length,0);
 assert.equal(e.useItemApply('scroll',c.id,key,out,use.id,opts),true,e.elementText('castErr'));assert.equal(c.inventory[0].qty,1);assert.deepEqual(plain(c.slots),slots,'a scroll does not spend a spell slot');
 const effect=c.activeFx.find(row=>row.itemUseId==='cast');assert.ok(effect?.conc);assert.equal(effect.expiresAtRound,e.state().fxRound+100);assert.ok(effect.fx.some(f=>f.stat==='detection.magic'&&f.value===1));
 e.artificerUtilityApi.breakConcentration(c,'проверка свитка');assert.equal(c.activeFx.some(row=>row.uid===effect.uid),false);
});

test('ritual utility costs no slot and advances its actual additional ten minutes',()=>{
 const w=world('detectMagic'),before=w.c.slots[1].cur,round=w.e.state().fxRound;w.input.artificerUtility.minutesCompleted=false;assert.equal(apply(w,'ritual'),false);assert.equal(w.c.slots[1].cur,before);
 w.input.artificerUtility.minutesCompleted=true;assert.equal(apply(w,'ritual'),true,w.e.elementText('castErr'));assert.equal(w.c.slots[1].cur,before);assert.equal(w.e.state().fxRound,round+100);assert.equal(w.a.entries(w.c)[0].expiresAtRound,round+200);
});

test('Light uses actual human Dexterity saves for unwilling carriers and replaces the preceding light',()=>{
 const w=world('light');assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.a.entries(w.c).length,1);
 Object.assign(w.input.artificerUtility,{unwilling:true,holderKey:'ally:'+w.t.id});const spec=w.a.saveSpec(w.sp,w.c,'ally:'+w.t.id),save=spec.rows.find(r=>r.type==='save');assert.ok(save);w.input.artificerUtility.saveValues={[save.key]:20};
 assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.a.entries(w.c).length,0);
 w.input.artificerUtility.saveValues={[save.key]:1};assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.a.entries(w.c).length,1);assert.match(w.a.controls(w.c),/6,096/);
});

test('Mage Hand enforces range, ten-pound capacity, action and durable rollback',async()=>{
 const w=world('mageHand');assert.equal(apply(w),true,w.e.elementText('castErr'));const entry=w.a.entries(w.c)[0],input={moveM:3,distanceM:5,weightLb:10,legal:true,location:'У двери',details:'Ключ положен на стол'};
 const bad=await w.a.action(w.c.id,entry.uid,'hand',{...input,weightLb:11});assert.equal(bad.success,false);
 const before=plain(w.e.state().chars),restore=w.e.learningApi.persistence(async()=>false);assert.equal((await w.a.action(w.c.id,entry.uid,'hand',input)).success,false);restore();assert.deepEqual(plain(w.e.state().chars),before);
 const live=w.e.state().chars[0],current=w.a.entries(live)[0];assert.equal((await w.a.action(live.id,current.uid,'hand',input)).success,true);assert.equal(w.a.entries(live)[0].artificerUtility.location,'У двери');
});

test('Dancing Lights requires connected groups and spends exactly one bonus action to move them',async()=>{
 const w=world('dancingLights');w.input.artificerUtility.connected=false;assert.equal(apply(w),false);w.input.artificerUtility.connected=true;assert.equal(apply(w),true,w.e.elementText('castErr'));const entry=w.a.entries(w.c)[0];
 w.e.setState({...w.e.state(),combat:{...w.e.blankCombat(),active:true,id:'lights',order:[{kind:'ally',id:w.c.id,initiative:20}],turnIndex:0,turn:{actorKey:'ally:'+w.c.id,actionsUsed:0,bonusUsed:false}}});
 const action={moveM:18,distanceM:30,connected:true,location:'У выхода'};assert.equal((await w.a.action(w.c.id,entry.uid,'move',action)).success,true);assert.equal((await w.a.action(w.c.id,entry.uid,'move',action)).success,false);
});

test('Prestidigitation limits noninstantaneous effects to three and never modifies damage or food quantity',async()=>{
 const w=world('prestidigitation'),inventory=plain(w.c.inventory),hp=w.c.hp;for(let i=0;i<3;i++){w.input.artificerUtility.scene='Кружка '+i;assert.equal(apply(w),true,w.e.elementText('castErr'));}assert.equal(w.a.entries(w.c).length,3);assert.equal(apply(w),false);assert.deepEqual(plain(w.c.inventory),inventory);assert.equal(w.c.hp,hp);
 assert.equal((await w.a.action(w.c.id,w.a.entries(w.c)[0].uid,'dismiss')).success,true);assert.equal(apply(w),true);w.a.round(600);assert.equal(w.a.entries(w.c).length,0);
});

test('Message records only entered words and response, blocks forbidden barriers and invalid targets',()=>{
 const w=world('message');w.input.artificerUtility.barrierBlocked=true;assert.equal(apply(w),false);assert.equal(w.c.artificerUtilityHistory,undefined);w.input.artificerUtility.barrierBlocked=false;assert.equal(apply(w),true,w.e.elementText('castErr'));assert.match(w.c.artificerUtilityHistory.at(-1).result,/Назовите пароль/);assert.equal(w.a.entries(w.c).length,0);
});

test('Mending checks one small break and advances one minute without restoring hit points or magical properties',()=>{
 const w=world('mending'),round=w.e.state().fxRound,hp=w.c.hp;w.input.artificerUtility.breakM=0.4;assert.equal(apply(w),false);w.input.artificerUtility.breakM=0.1;assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.e.state().fxRound,round+10);assert.equal(w.c.hp,hp);assert.match(w.c.artificerUtilityHistory.at(-1).result,/плаща/);
});

test('Mending in combat uses ten consecutive actions and concentration before repairing the object',async()=>{
 const w=world('mending'),{e,c,sp}=w;assert.equal(e.combatStart([{kind:'ally',id:c.id,nat:20},{kind:'foe',id:'foe_goblin_scout',nat:1}],'Починка'),true);
 const args=[sp.id,c.id,'none','',undefined,'0',null,[],{},w.input],before=c.slots[1].cur;const first=await e.arcanumRuntime.longStart(args);assert.equal(first.success,true,first.message);assert.equal(c.artificerUtilityHistory,undefined);assert.ok(c.activeFx.some(f=>f.arcanumLongCast&&f.conc));
 for(let turn=2;turn<=10;turn++){assert.equal(e.combatNextTurn(),true);assert.equal(e.combatNextTurn(),true);const result=await e.arcanumRuntime.longContinue(c.id,{...w.input,arcanum:{completionFactsConfirmed:true}});assert.equal(result.success,true,result.message);}
 const live=e.state().chars.find(h=>h.id===c.id);assert.equal(live.slots[1].cur,before);assert.equal(live.activeFx.some(f=>f.arcanumLongCast),false);assert.match(live.artificerUtilityHistory.at(-1).result,/плаща/);assert.equal((await e.arcanumRuntime.longContinue(c.id,w.input)).success,false);
});

test('Identify remains subject to the priced pearl component and never invents hidden properties',()=>{
 const w=world('identify');assert.equal(apply(w),false,'a held tool cannot replace the priced pearl');assert.equal(w.c.artificerUtilityHistory,undefined);assert.equal(preflight(w).ok,true);
 const details=w.input.artificerUtility.details;w.input.artificerUtility.details='';assert.equal(preflight(w).ok,false);w.input.artificerUtility.details=details;
 const pearl=w.e.state().items.find(it=>it.id==='it_starter_identify_pearl');assert.ok(pearl,'the purchasable pearl is catalogued');assert.equal(w.c.inventory.some(e=>e.itemId===pearl.id),false,'the 100 gp component is not granted free with starter equipment');w.c.inventory.push({id:'purchased-pearl',itemId:pearl.id,qty:1});
 const examined=w.c.inventory.find(e=>e.id!=='purchased-pearl'),before=w.c.slots[1].cur,round=w.e.state().fxRound;w.input.artificerUtility.inventoryEntryId=examined.id;
 assert.equal(apply(w),false,'priced pearl also requires a free hand');delete w.c.equipment.MAIN_HAND;
 assert.equal(apply(w),true,w.e.elementText('castErr'));assert.equal(w.c.slots[1].cur,before-1);assert.equal(w.e.state().fxRound,round+10);assert.equal(w.c.inventory.find(e=>e.id==='purchased-pearl').qty,1);assert.equal(examined.artificerIdentification.facts,details);
});

test('Purify Food and Drink only marks an explicitly nonmagical bounded food area',()=>{
 const w=world('purifyFoodDrink');w.input.artificerUtility.nonmagicalFood=false;assert.equal(apply(w),false);w.input.artificerUtility.nonmagicalFood=true;assert.equal(apply(w),true,w.e.elementText('castErr'));assert.match(w.c.artificerUtilityHistory.at(-1).result,/очищены/);assert.equal(w.a.entries(w.c).length,0);
});

test('Disguise Self respects anatomy, height and entered investigation; Alarm retains exclusions and one-mile limit',async()=>{
 const w=world('disguiseSelf');w.input.artificerUtility.heightDeltaM=1;assert.equal(apply(w),false);w.input.artificerUtility.heightDeltaM=0.2;assert.equal(apply(w),true,w.e.elementText('castErr'));let entry=w.a.entries(w.c)[0];
 assert.equal((await w.a.action(w.c.id,entry.uid,'inspect',{observer:'Страж',physical:false,actionConfirmed:true,investigationTotal:20})).success,true);assert.match(w.c.artificerUtilityHistory.at(-1).result,/распознал/);
 const alarm=world('alarm'),start=alarm.e.state().fxRound;assert.equal(apply(alarm),true,alarm.e.elementText('castErr'));assert.equal(alarm.e.state().fxRound,start+10);entry=alarm.a.entries(alarm.c)[0];assert.equal(entry.expiresAtRound,start+4810);
 const event={creature:'Лиора',tinyOrLarger:true,entered:true,casterDistanceM:10};assert.equal((await alarm.a.action(alarm.c.id,entry.uid,'alarm',event)).success,true);assert.match(alarm.c.artificerUtilityHistory.at(-1).result,/исключено/);
 assert.equal((await alarm.a.action(alarm.c.id,entry.uid,'alarm',{...event,creature:'Гоблин',casterDistanceM:1700})).success,true);assert.match(alarm.c.artificerUtilityHistory.at(-1).result,/не получен/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const success=result=>result===true||result?.success===true||result?.ok===true;
async function world(name){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const c=Object.assign(e.buildBlank(),{id:'condition-caster',name:'Колдун',cls:'Колдун',subcls:'Исчадие',level:11,ab:{str:10,dex:10,con:14,int:10,wis:12,cha:18}});
  const target=Object.assign(e.buildBlank(),{id:'condition-target',name:'Цель',hp:100,hpMax:100,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10}});
  const other=Object.assign(e.buildBlank(),{id:'condition-other',name:'Вторая цель',hp:100,hpMax:100,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10}});
  const foe={id:'condition-enemy',n:'Противник',hp:100,hpMax:100,ac:10,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},activeFx:[],cond:[]};
  e.setState({...e.catalogs,chars:[c,target,other],foes:[foe],activeCharId:c.id});a.withoutPresentation();l.quiet();e.combatLifecycleApi.quiet();a.characterAdopt(c);a.applyClassSlots(c);a.upgradeSpellcastingState(c);e.guardRandom();
  c.inventory.push({id:'component-pouch',itemId:'it_reagent_bag',qty:1});
  const sp=e.state().spells.find(sp=>e.grimoireApi.grimoireActive(sp)&&e.grimoireApi.rules.identity(sp)===e.grimoireApi.rules.normalize(name));
  assert.ok(sp,name);assert.equal(success(await l.select(c.id,sp.id,'arcanum',{circle:6})),true);
  return {e,a,l,c,target,other,foe,sp,rt:e.arcanumRuntime};
}
function rolls(w,target=w.target,save=1){
  const spec=w.e.rollSpecOf(w.sp,{kind:'spell',caster:w.c,slotLvl:6,target:w.e.targetInfoOf('ally:'+target.id)}),values={};
  for(const row of spec.rows)values[row.key]=row.type==='save'?save:row.cnt||1;
  const outcome=w.e.resolveOutcome(spec,values);return w.a.castFormulaRollsBuild(spec,values,outcome).rolls;
}
async function cast(w,options={}){
  const selected=options.targets||[w.target],keys=selected.map(t=>'ally:'+t.id),byTarget={},facts={};
  selected.forEach((t,i)=>{byTarget[keys[i]]=rolls(w,t,options.saves?.[i]??1);facts[keys[i]]={visible:true,distanceM:3,flesh:true,hears:true,understands:true,...options.facts};});
  const input={arcanum:{mode:options.mode||'asleep',order:'Отнесите письмо на почту.',reasonable:true,harmful:false,byTarget:facts,...options.input}};
  return w.e.arcanumApi.cast(w.sp.id,w.c.id,keys[0],'',undefined,'6:arcanum',byTarget[keys[0]],keys.slice(1),byTarget,input);
}
const marker=w=>w.c.activeFx.find(entry=>entry.arcanumCast);
const fx=(w,target=w.target)=>target.activeFx?.find(entry=>entry.arcanumConditionCast);
function change(w,type,extra={}){const result=w.rt.conditionEvent(marker(w).castId,{type,...extra});assert.equal(result.ok,true,result.reason);return result;}
function repeat(w,turn,total){return change(w,'endTurn',{targetId:'ally:'+w.target.id,turnId:turn,save:{total}});}

test('production Eyebite casts with physical WIS dice and projects source-owned sleep; actual damage wakes only that source',async()=>{
  const w=await world('Eyebite');w.target.cond=['Сбитый с ног'];
  assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus')); assert.equal(w.c.mysticArcanum.choices[6].spent,true);assert.ok(marker(w));
  assert.ok(w.e.effectiveConditions(w.target).includes('Бессознательный'));assert.ok(w.rt.controls(w.target).includes('Разбудить действием'));
  w.e.combatLifecycleApi.applyDamageTo('ally:'+w.target.id,1,'рубящий','Удар',{sourceActorKey:'foe:'+w.foe.id});
  assert.equal(fx(w),undefined);assert.ok(w.e.effectiveConditions(w.target).includes('Сбитый с ног'));assert.equal(w.target.hp,99);
  assert.ok(marker(w),'the caster retains the gaze for another action');assert.equal(w.c.mysticArcanum.choices[6].spent,true);
});
test('production Flesh to Stone projects cumulative repeats, transforms after three failures, survives a minute permanently',async()=>{
  const w=await world('Flesh to Stone');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  assert.ok(w.e.effectiveConditions(w.target).includes('Опутанный'));assert.equal(fx(w).repeatSave.key,'con');assert.match(w.rt.controls(w.target),/успехи 0\/3.*провалы 0\/3/);
  repeat(w,'one',1);repeat(w,'two',20);repeat(w,'three',1);assert.equal(marker(w).arcanumCast.targets[0].failures,2);assert.ok(w.e.effectiveConditions(w.target).includes('Опутанный'));
  repeat(w,'four',1);assert.ok(w.e.effectiveConditions(w.target).includes('Окаменевший'));assert.equal(fx(w).repeatSave,undefined);
  w.e.combatLifecycleApi.advanceFxRound(10);assert.equal(marker(w).arcanumCast.status,'permanent');assert.equal(fx(w).conc,false);
  w.e.combatLifecycleApi.breakConcentration(w.c,'новая концентрация');assert.ok(w.e.effectiveConditions(w.target).includes('Окаменевший'));
  change(w,'remove',{targetId:'ally:'+w.target.id});assert.equal(fx(w),undefined);assert.equal(marker(w),undefined);
});
test('production Mass Suggestion applies independent real saves and ends only the harmed/completed target without imposing Charmed',async()=>{
  const w=await world('Mass Suggestion');assert.equal(success(await cast(w,{targets:[w.target,w.other]})),true,w.e.elementText('saveStatus'));
  assert.ok(fx(w));assert.ok(fx(w,w.other));assert.equal(marker(w).conc,false);assert.equal(w.e.effectiveConditions(w.target).includes('Очарованный'),false);
  assert.match(w.rt.controls(w.target),/Отнесите письмо на почту/);
  w.e.combatLifecycleApi.applyDamageTo('ally:'+w.target.id,1,'рубящий','Противник',{sourceActorKey:'foe:'+w.foe.id});assert.ok(fx(w));
  w.e.combatLifecycleApi.applyDamageTo('ally:'+w.target.id,1,'рубящий','Спутник',{sourceActorKey:'ally:'+w.other.id});assert.equal(fx(w),undefined);assert.ok(fx(w,w.other));
  change(w,'taskComplete',{targetId:'ally:'+w.other.id});assert.equal(fx(w,w.other),undefined);assert.equal(marker(w),undefined);assert.equal(w.c.mysticArcanum.choices[6].spent,true);
});
test('production Eyebite retarget spends a real combat action but never a second arcanum or spell slot',async()=>{
  const w=await world('Eyebite');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  assert.equal(w.e.combatStart([{kind:'ally',id:w.c.id,nat:20},{kind:'foe',id:w.foe.id,nat:1}],'Дурной глаз'),true);
  const resources=plain({arcanum:w.c.mysticArcanum,slots:w.c.slots}),key='ally:'+w.other.id,castId=marker(w).castId;
  const spec=w.rt.saveSpec(key,{key:'wis',dc:marker(w).arcanumCast.dc,magic:true},w.sp.n),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));
  const args={targetKey:key,mode:'sickened',facts:{visible:true,distanceM:3},values,specToken:spec.token,turnStamp:w.rt.stamp()};
  assert.equal(success(await w.rt.retarget(castId,args)),true,w.e.elementText('saveStatus'));
  assert.equal(w.e.state().combat.turn.actionsUsed,1);assert.deepEqual(plain({arcanum:w.c.mysticArcanum,slots:w.c.slots}),resources);
  assert.ok(fx(w));assert.ok(fx(w,w.other));assert.equal(fx(w,w.other).repeatSave.key,'wis');
  assert.equal(success(await w.rt.retarget(castId,args)),false);assert.equal(w.e.state().combat.turn.actionsUsed,1);
  w.e.combatLifecycleApi.breakConcentration(w.c,'проверка завершения');assert.equal(fx(w),undefined);assert.equal(fx(w,w.other),undefined);assert.equal(marker(w),undefined);
});
test('production end-turn Flesh to Stone saves commit actual dice once per turn and three successes remove the source',async()=>{
  const w=await world('Flesh to Stone');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  assert.equal(w.e.combatStart([{kind:'ally',id:w.target.id,nat:20},{kind:'ally',id:w.c.id,nat:15},{kind:'foe',id:w.foe.id,nat:1}],'Спасброски'),true);
  for(let n=0;n<3;n++){
    const key='ally:'+w.target.id,entry=fx(w),stamp=w.rt.stamp(),spec=w.rt.saveSpec(key,entry.repeatSave,entry.label),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.max]));
    assert.equal(w.e.state().combat.turn.actorKey,key);
    assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),true,w.e.elementText('saveStatus'));
    assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),false,'same physical roll cannot count twice');
    if(n<2){assert.equal(marker(w).arcanumCast.targets[0].successes,n+1);for(let k=0;k<3;k++)await w.e.combatNextTurn();}
  }
  assert.equal(fx(w),undefined);assert.equal(marker(w),undefined);assert.equal(w.c.mysticArcanum.choices[6].spent,true);
});
test('production condition cast rejects missing scene facts before resource commit and durable failure restores all targets',async()=>{
  const w=await world('Flesh to Stone'),before=plain([w.c,w.target]);
  assert.equal(success(await cast(w,{facts:{flesh:undefined}})),false);assert.deepEqual(plain([w.c,w.target]),before);
  const restore=w.l.persistence(async()=>false);assert.equal(success(await cast(w)),false);restore();assert.deepEqual(plain([w.c,w.target]),before);
  assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));assert.ok(fx(w));
});
test('production Mass Suggestion successful saves stay unaffected and duration expires after exactly twenty-four game hours',async()=>{
  const w=await world('Mass Suggestion');assert.equal(success(await cast(w,{targets:[w.target,w.other],saves:[1,20]})),true,w.e.elementText('saveStatus'));
  assert.ok(fx(w));assert.equal(fx(w,w.other),undefined);w.e.combatLifecycleApi.advanceFxRound(14399);assert.ok(fx(w));
  w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(fx(w),undefined);assert.equal(marker(w),undefined);
});
test('production Flesh to Stone retains counters and concentration across save/reload; early interruption reverses it',async()=>{
  const w=await world('Flesh to Stone');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  repeat(w,'first',1);repeat(w,'second',20);assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  w.c=w.e.state().chars.find(c=>c.id===w.c.id);w.target=w.e.state().chars.find(c=>c.id===w.target.id);
  assert.equal(marker(w).arcanumCast.targets[0].failures,1);assert.equal(marker(w).arcanumCast.targets[0].successes,1);assert.ok(fx(w).repeatSave);
  repeat(w,'third',1);repeat(w,'fourth',1);assert.ok(w.e.effectiveConditions(w.target).includes('Окаменевший'));
  w.e.combatLifecycleApi.breakConcentration(w.c,'до минуты');assert.equal(fx(w),undefined);assert.equal(marker(w),undefined);assert.equal(w.e.effectiveConditions(w.target).includes('Окаменевший'),false);
});
test('production Eyebite sickened projects attack/check disadvantage and successful repeat blocks targeting by the same cast',async()=>{
  const w=await world('Eyebite');assert.equal(success(await cast(w,{mode:'sickened'})),true,w.e.elementText('saveStatus'));
  assert.ok(fx(w).fx.some(row=>row.stat==='attack'&&row.mode==='dis'));assert.ok(fx(w).fx.some(row=>row.stat==='check'&&row.mode==='dis'));
  assert.equal(w.e.effectiveConditions(w.target).includes('Отравленный'),false);assert.equal(fx(w).repeatSave.key,'wis');
  repeat(w,'first',20);assert.equal(fx(w),undefined);assert.ok(marker(w).arcanumCast.immuneTargetIds.includes('ally:'+w.target.id));
  const key='ally:'+w.target.id,spec=w.rt.saveSpec(key,{key:'wis',dc:16,magic:true},w.sp.n),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));
  const before=plain(marker(w).arcanumCast);assert.equal(success(await w.rt.retarget(marker(w).castId,{targetKey:key,mode:'asleep',facts:{visible:true,distanceM:3},values})),false);
  assert.deepEqual(plain(marker(w).arcanumCast),before);
});
test('production Eyebite panic uses distance AND visibility and preserves an independent frightened effect',async()=>{
  const w=await world('Eyebite');w.e.tabletopApi.applyFx(w.target.id,{uid:'independent-fear',k:'spell',id:'fixture-fear',label:'Другой страх',castId:'independent-cast',fx:[{stat:'condition',mode:'text',value:'Испуганный'}]});
  assert.equal(success(await cast(w,{mode:'panicked'})),true,w.e.elementText('saveStatus'));assert.ok(fx(w));
  assert.match(w.rt.controls(w.target),/Проверить расстояние и видимость/);
  change(w,'position',{targetId:'ally:'+w.target.id,distanceFeet:60,canSeeCaster:true});assert.ok(fx(w));
  change(w,'position',{targetId:'ally:'+w.target.id,distanceFeet:59,canSeeCaster:false});assert.ok(fx(w));
  change(w,'position',{targetId:'ally:'+w.target.id,distanceFeet:60,canSeeCaster:false});assert.equal(fx(w),undefined);
  assert.ok(w.target.activeFx.some(entry=>entry.castId==='independent-cast'));assert.ok(w.e.effectiveConditions(w.target).includes('Испуганный'));
});
test('outside combat elapsed time cannot skip Flesh to Stone saves; cancelling and duplicate answers preserve the pending turn',async()=>{
  const w=await world('Flesh to Stone');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  const start=w.e.state().fxRound,original=plain(marker(w).arcanumCast);
  assert.equal(w.e.combatLifecycleApi.advanceFxRound(10),false);assert.equal(w.e.state().fxRound,start);assert.ok(w.e.combatLifecycleApi.roll());
  w.a.rollCancel();assert.equal(w.e.state().fxRound,start);assert.deepEqual(plain(marker(w).arcanumCast),original);
  for(let i=0;i<2;i++){
    const key='ally:'+w.target.id,entry=fx(w),stamp=w.rt.stamp(),spec=w.rt.saveSpec(key,entry.repeatSave,entry.label),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));
    assert.equal(stamp,'world:'+(start+i));assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),true,w.e.elementText('saveStatus'));
    assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),false);
    assert.equal(w.e.combatLifecycleApi.advanceFxRound(10),false);assert.equal(w.e.state().fxRound,start+i+1,'advance stops at the next pending save');
    assert.equal(marker(w).arcanumCast.targets[0].failures,i+1);assert.ok(w.e.combatLifecycleApi.roll());w.a.rollCancel();
  }
  const key='ally:'+w.target.id,entry=fx(w),spec=w.rt.saveSpec(key,entry.repeatSave,entry.label),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));
  assert.equal(success(await w.rt.repeatCommit(key,entry.uid,w.rt.stamp(),spec,values)),true,w.e.elementText('saveStatus'));
  assert.equal(marker(w).arcanumCast.targets[0].mode,'petrified');assert.equal(w.rt.pending(key).length,0);
});
test('outside combat pending-save receipts survive reload and a missing result never advances time or counts failure',async()=>{
  const w=await world('Eyebite');assert.equal(success(await cast(w,{mode:'sickened'})),true,w.e.elementText('saveStatus'));
  const key='ally:'+w.target.id,entry=fx(w),stamp=w.rt.stamp(),spec=w.rt.saveSpec(key,entry.repeatSave,entry.label),before=plain(marker(w).arcanumCast);
  assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,{})),false);assert.deepEqual(plain(marker(w).arcanumCast),before);
  const values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),true);
  await w.e.loadAll();w.c=w.e.state().chars.find(c=>c.id===w.c.id);w.target=w.e.state().chars.find(c=>c.id===w.target.id);
  assert.equal(w.rt.pending(key).length,0);assert.equal(success(await w.rt.repeatCommit(key,entry.uid,stamp,spec,values)),false);
  w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(w.rt.pending(key).length,1);
});
test('Eyebite missing or stale retarget dice cannot consume a combat action or add another victim',async()=>{
  const w=await world('Eyebite');assert.equal(success(await cast(w)),true,w.e.elementText('saveStatus'));
  assert.equal(w.e.combatStart([{kind:'ally',id:w.c.id,nat:20},{kind:'foe',id:w.foe.id,nat:1}],'Устаревший бросок'),true);
  const key='ally:'+w.other.id,castId=marker(w).castId,spec=w.rt.saveSpec(key,{key:'wis',dc:16,magic:true},w.sp.n),values=Object.fromEntries(spec.rows.map(row=>[row.key,row.min]));
  const args={targetKey:key,mode:'sickened',facts:{visible:true,distanceM:3},values:{},specToken:spec.token,turnStamp:w.rt.stamp()},before=plain(marker(w).arcanumCast);
  assert.equal(success(await w.rt.retarget(castId,args)),false);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  w.other.ab.wis=20;assert.equal(success(await w.rt.retarget(castId,{...args,values})),false);assert.equal(w.e.state().combat.turn.actionsUsed,0);
  assert.deepEqual(plain(marker(w).arcanumCast),before);assert.equal(fx(w,w.other),undefined);assert.equal(w.c.mysticArcanum.choices[6].spent,true);
});

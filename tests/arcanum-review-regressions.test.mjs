import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const success=value=>value===true||value?.success===true||value?.ok===true;
async function world(name='Eyebite'){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const caster=Object.assign(e.buildBlank(),{id:'review-caster',name:'Заклинатель',cls:'Колдун',level:11,ab:{str:10,dex:10,con:14,int:10,wis:10,cha:18}});
  const target=Object.assign(e.buildBlank(),{id:'review-target',name:'Цель',hp:100,hpMax:100});
  const other=Object.assign(e.buildBlank(),{id:'review-other',name:'Другая цель',hp:100,hpMax:100});
  const foe={...plain(e.catalogs.foes.find(f=>f.id==='foe_goblin_scout')),id:'review-foe',n:'Противник'};
  e.setState({...e.catalogs,chars:[caster,target,other],foes:[foe],activeCharId:caster.id});a.withoutPresentation();l.quiet();e.combatLifecycleApi.quiet();a.characterAdopt(caster);a.applyClassSlots(caster);a.upgradeSpellcastingState(caster);e.guardRandom();
  caster.inventory.push({id:'pouch',itemId:'it_reagent_bag',qty:1});
  const spell=e.state().spells.find(sp=>e.grimoireApi.grimoireActive(sp)&&e.grimoireApi.rules.identity(sp)===e.grimoireApi.rules.normalize(name));
  assert.ok(spell);assert.equal(success(await l.select(caster.id,spell.id,'arcanum',{circle:6})),true);
  const cast=async(key='ally:'+target.id,mode='asleep')=>{
    if(name==='Conjure Fey')return e.arcanumApi.cast(spell.id,caster.id,'none','',undefined,'6:arcanum',{},[],{}, {arcanum:{castingMinuteCompleted:true,templateId:'foe_wolf',positionConfirmed:true,initiativeDie:14}});
    const spec=e.rollSpecOf(spell,{kind:'spell',caster,slotLvl:6,target:e.targetInfoOf(key)}),values=Object.fromEntries(spec.rows.map(r=>[r.key,r.type==='save'?1:r.cnt||1])),rolls=a.castFormulaRollsBuild(spec,values,e.resolveOutcome(spec,values)).rolls;
    return e.arcanumApi.cast(spell.id,caster.id,key,'',undefined,'6:arcanum',rolls,[],{}, {arcanum:{mode,order:'Отнесите письмо на почту.',reasonable:true,harmful:false,byTarget:{[key]:{visible:true,distanceM:3,flesh:true,hears:true,understands:true}}}});
  };
  return {e,a,l,caster,target,other,foe,spell,cast,rt:e.arcanumRuntime};
}
const projection=holder=>(holder.activeFx||[]).find(f=>f.arcanumConditionCast);
const marker=w=>w.caster.activeFx.find(f=>f.arcanumCast);
function antimagic(w,holder){
  const effect={k:'spell',id:'review-antimagic',label:'Антимагическое поле',antimagic:true,fx:[]};
  w.e.tabletopApi.applyFx(holder.id,effect);return effect;
}

for(const slot of [3,6])test('Dispel Magic on a foe ends its actual Eyebite source and cannot reappear after time advances, slot '+slot,async()=>{
  const w=await world();assert.equal(success(await w.cast('foe:'+w.foe.id)),true,w.e.elementText('saveStatus'));assert.ok(projection(w.foe));
  const dispel=w.e.state().spells.find(sp=>w.e.grimoireApi.rules.identity(sp)===w.e.grimoireApi.rules.normalize('Dispel Magic'));
  assert.equal(w.rt.dispel(dispel,w.caster,'foe:'+w.foe.id,slot),true);
  if(slot===3){const pending=w.e.combatLifecycleApi.roll();assert.ok(pending);pending.apply(Object.fromEntries(pending.rows.map(row=>[row.key,20])));}
  assert.equal(projection(w.foe),undefined);assert.equal(marker(w).arcanumCast.targets[0].status,'ended');
  w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(projection(w.foe),undefined);
});
test('removing a fey concentration marker releases a hostile creature until original expiry and survives saving',async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),effect=w.caster.activeFx.find(f=>f.arcanumFey),deadline=actor.arcanumSummon.expiresAtRound;
  assert.equal(w.rt.remove(w.caster.id,effect.uid),true);assert.ok(w.e.state().foes.find(f=>f.id===actor.id));assert.equal(actor.arcanumSummon.controlled,false);assert.equal(actor.summonSide,'enemy');
  assert.equal(actor.arcanumSummon.expiresAtRound,deadline);assert.equal(w.caster.activeFx.some(f=>f.arcanumFey),false);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();const loaded=w.e.state().foes.find(f=>f.id===actor.id);assert.ok(loaded);assert.equal(loaded.arcanumSummon.controlled,false);
});
test('Dispel Magic targeting the summoned fey removes the creature and its caster marker immediately',async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),dispel=w.e.state().spells.find(sp=>w.e.grimoireApi.rules.identity(sp)===w.e.grimoireApi.rules.normalize('Dispel Magic'));
  assert.ok(actor.activeFx.some(f=>f.arcanumFeyTarget));assert.equal(w.rt.dispel(dispel,w.caster,'foe:'+actor.id,6),true);
  assert.equal(w.e.state().foes.some(f=>f.id===actor.id),false);assert.equal(w.caster.activeFx.some(f=>f.arcanumFey),false);
});
test('Dispel Magic also removes a fey that became hostile when concentration broke',async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),dispel=w.e.state().spells.find(sp=>w.e.grimoireApi.rules.identity(sp)===w.e.grimoireApi.rules.normalize('Dispel Magic'));
  w.e.combatLifecycleApi.breakConcentration(w.caster,'разрыв');assert.equal(actor.summonSide,'enemy');
  assert.equal(w.rt.dispel(dispel,w.caster,'foe:'+actor.id,6),true);assert.equal(w.e.state().foes.some(f=>f.id===actor.id),false);
});
for(const removal of ['dispel','released marker','expiry'])test('removing an earlier summoned fey preserves the current actor and spent action: '+removal,async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),key='ally:'+w.caster.id;
  assert.equal(w.e.combatStart([{kind:'foe',id:actor.id,nat:20},{kind:'ally',id:w.caster.id,nat:15},{kind:'ally',id:w.target.id,nat:10},{kind:'foe',id:w.foe.id,nat:1}],'Удаление призыва'),true);
  w.e.combatNextTurn();assert.equal(w.e.state().combat.turn.actorKey,key);
  assert.equal(w.e.combatSpend('action','Уже использованное действие',key),true);
  if(removal==='released marker')w.e.combatLifecycleApi.breakConcentration(w.caster,'разрыв');
  assert.equal(await w.e.saveWorldNow(),true);assert.equal(w.e.saveSafety.pending(),false);
  if(removal==='dispel'){
    const dispel=w.e.state().spells.find(sp=>w.e.grimoireApi.rules.identity(sp)===w.e.grimoireApi.rules.normalize('Dispel Magic'));
    assert.equal(w.rt.dispel(dispel,w.caster,'foe:'+actor.id,6),true);
  }else if(removal==='released marker'){
    assert.equal(w.rt.removeFoe(actor.id,actor.activeFx.find(f=>f.arcanumFeyTarget).uid),true);
    assert.equal(w.e.saveSafety.pending(),true,'Removing a released fey must schedule persistence even with no remaining cast group');
  }else {actor.arcanumSummon.expiresAtRound=w.e.state().fxRound;w.rt.tick();}
  const verify=()=>{
    const state=w.e.state(),current=state.combat.order[state.combat.turnIndex];
    assert.equal(state.foes.some(f=>f.id===actor.id),false);
    assert.equal(state.combat.order.some(e=>e.kind==='foe'&&e.id===actor.id),false);
    assert.equal(current.kind+':'+current.id,key);assert.equal(state.combat.turn.actorKey,key);
    assert.equal(state.combat.turn.actionsUsed,1);assert.equal(w.e.combatCanSpend('action',key),false);
  };
  verify();assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();verify();
});
test('round transition skips an expiring next fey and starts the remaining actor with a fresh action',async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),casterKey='ally:'+w.caster.id,foeKey='foe:'+w.foe.id;
  assert.equal(w.e.combatStart([{kind:'foe',id:actor.id,nat:20},{kind:'ally',id:w.caster.id,nat:15},{kind:'foe',id:w.foe.id,nat:1}],'Истечение на границе раунда'),true);
  assert.equal(w.e.combatNextTurn(),true);assert.equal(w.e.state().combat.turn.actorKey,casterKey);
  assert.equal(w.e.combatSpend('action','Действие заклинателя',casterKey),true);
  assert.equal(w.e.combatNextTurn(),true);assert.equal(w.e.state().combat.turn.actorKey,foeKey);
  assert.equal(w.e.combatSpend('action','Действие противника',foeKey),true);
  const round=w.e.state().fxRound;actor.arcanumSummon.expiresAtRound=round+1;
  assert.equal(w.e.combatNextTurn(),true,w.e.elementText('saveStatus'));
  const state=w.e.state(),current=state.combat.order[state.combat.turnIndex];
  assert.equal(state.fxRound,round+1);assert.equal(state.combat.round,2);
  assert.equal(state.foes.some(f=>f.id===actor.id),false);assert.equal(state.combat.order.some(e=>e.id===actor.id),false);
  assert.equal(current.kind+':'+current.id,casterKey);assert.equal(state.combat.turn.actorKey,casterKey);
  assert.equal(state.combat.turn.actionsUsed,0);assert.equal(w.e.combatCanSpend('action',casterKey),true);
});
test('foe minus-HP control wakes Eyebite sleep and immediately removes a zero-HP summoned fey',async()=>{
  const w=await world();assert.equal(success(await w.cast('foe:'+w.foe.id)),true,w.e.elementText('saveStatus'));
  const hp=w.foe.hp;w.rt.foeHp(w.foe.id,-1);assert.equal(w.foe.hp,hp-1);assert.equal(projection(w.foe),undefined);
  const summoned=await world('Conjure Fey');assert.equal(success(await summoned.cast()),true,summoned.e.elementText('saveStatus'));
  const actor=summoned.e.state().foes.find(f=>f.arcanumSummon);summoned.rt.foeHp(actor.id,-actor.hp);assert.equal(summoned.e.state().foes.some(f=>f.id===actor.id),false);
});

for(const last of [false,true])test('a fey disappearing during its own turn hands a fresh turn to the next actor, last='+last,async()=>{
  const w=await world('Conjure Fey');assert.equal(success(await w.cast()),true);
  const actor=w.e.state().foes.find(f=>f.arcanumSummon),key='foe:'+actor.id,casterKey='ally:'+w.caster.id;
  assert.equal(w.e.combatStart([{kind:'foe',id:actor.id,nat:last?1:20},{kind:'ally',id:w.caster.id,nat:15}],'Исчезновение текущего существа'),true);
  if(last)assert.equal(w.e.combatNextTurn(),true);
  assert.equal(w.e.state().combat.turn.actorKey,key);assert.equal(w.e.combatSpend('action','Атака феи',key),true);
  const round=w.e.state().fxRound;w.rt.foeHp(actor.id,-actor.hp);
  const state=w.e.state();assert.equal(state.foes.some(f=>f.id===actor.id),false);assert.equal(state.combat.order.some(e=>e.id===actor.id),false);
  assert.equal(state.combat.turn.actorKey,casterKey);assert.equal(state.combat.turn.actionsUsed,0);assert.equal(state.fxRound,round+(last?1:0));
  assert.equal(w.e.combatCanSpend('action',casterKey),true);
});
test('foe HP damage asks missing Mass Suggestion source and foe reset ends its source before clearing projections',async()=>{
  const w=await world('Mass Suggestion');assert.equal(success(await w.cast('foe:'+w.foe.id)),true,w.e.elementText('saveStatus'));
  let asked=0;w.a.confirmWith(()=>{asked++;return false;});w.rt.foeHp(w.foe.id,-1);assert.equal(asked,1);assert.ok(projection(w.foe));
  w.rt.foeReset(w.foe.id);assert.equal(projection(w.foe),undefined);assert.equal(marker(w),undefined);
  w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(projection(w.foe),undefined);
});
test('caster antimagic blocks Eyebite retarget without changing state or daily use, and removal restores access',async()=>{
  const w=await world();assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));const am=antimagic(w,w.caster);
  const key='ally:'+w.other.id,spec=w.rt.saveSpec(key,{key:'wis',dc:16,magic:true},w.spell.n),args={targetKey:key,mode:'asleep',facts:{visible:true,distanceM:3},values:Object.fromEntries(spec.rows.map(row=>[row.key,row.min]))};
  const before=plain(marker(w).arcanumCast);assert.equal(success(await w.rt.retarget(marker(w).castId,args)),false);assert.deepEqual(plain(marker(w).arcanumCast),before);assert.equal(projection(w.other),undefined);
  w.rt.remove(w.caster.id,am.uid);assert.equal(success(await w.rt.retarget(marker(w).castId,args)),true,w.e.elementText('saveStatus'));assert.ok(projection(w.other));
});
test('antimagic suppresses sickened saving-throw requests while duration still advances, then restores them',async()=>{
  const w=await world();assert.equal(success(await w.cast('ally:'+w.target.id,'sickened')),true,w.e.elementText('saveStatus'));
  const key='ally:'+w.target.id,entry=projection(w.target),spec=w.rt.saveSpec(key,entry.repeatSave,entry.label),am=antimagic(w,w.target);
  assert.equal(w.e.abilitiesApi.charFxAll(w.target).some(f=>f.stat==='check'),false);assert.equal(w.rt.pending(key).length,0);
  assert.equal(success(await w.rt.repeatCommit(key,entry.uid,w.rt.stamp(),spec,Object.fromEntries(spec.rows.map(row=>[row.key,row.max])))),false);
  const start=w.e.state().fxRound;w.e.combatLifecycleApi.advanceFxRound(1);assert.equal(w.e.state().fxRound,start+1);assert.equal(marker(w).arcanumCast.elapsedSeconds,6);
  w.rt.remove(w.target.id,am.uid);assert.equal(w.rt.pending(key).length,1);assert.ok(w.e.abilitiesApi.charFxAll(w.target).some(f=>f.stat==='check'));
});
test('antimagic suppresses panic turn prompts and forced Dash while retaining the effect for after the field',async()=>{
  const w=await world();assert.equal(success(await w.cast('ally:'+w.target.id,'panicked')),true,w.e.elementText('saveStatus'));antimagic(w,w.target);
  assert.equal(w.e.effectiveConditions(w.target).includes('Испуганный'),false);
  // The fixture prompt function throws, so any unjustified scene prompt fails this test.
  assert.equal(w.rt.panic('ally:'+w.target.id,true),true);assert.equal(marker(w).arcanumCast.targets[0].status,'active');
});
test('known deafness cannot be overruled by a stale Mass Suggestion hearing confirmation',async()=>{
  const w=await world('Mass Suggestion');w.target.cond=['Глухой'];
  assert.equal(success(await w.cast()),false);assert.equal(w.caster.mysticArcanum.choices[6].spent,false);assert.equal(projection(w.target),undefined);
});
test('known caster blindness cannot be overruled by an Eyebite visibility confirmation',async()=>{
  const w=await world();w.caster.cond=['Ослепленный'];
  assert.equal(success(await w.cast()),false);assert.equal(w.caster.mysticArcanum.choices[6].spent,false);assert.equal(projection(w.target),undefined);
});
test('Eyebite retarget rejects a newly blinded caster before applying another victim or spending an action',async()=>{
  const w=await world();assert.equal(success(await w.cast()),true,w.e.elementText('saveStatus'));
  assert.equal(w.e.combatStart([{kind:'ally',id:w.caster.id,nat:20},{kind:'foe',id:w.foe.id,nat:1}],'Взгляд ослеплённого'),true);
  const key='ally:'+w.other.id,spec=w.rt.saveSpec(key,{key:'wis',dc:16,magic:true},w.spell.n),state=plain(marker(w).arcanumCast);
  w.caster.cond=['Ослепленный'];
  const result=await w.rt.retarget(marker(w).castId,{targetKey:key,mode:'asleep',facts:{visible:true,distanceM:3},values:Object.fromEntries(spec.rows.map(row=>[row.key,row.min])),specToken:spec.token,turnStamp:w.rt.stamp()});
  assert.equal(success(result),false);assert.equal(w.e.state().combat.turn.actionsUsed,0);assert.deepEqual(plain(marker(w).arcanumCast),state);assert.equal(projection(w.other),undefined);
});
for(const kind of ['ally','foe'])test('magical-save advantage and bonus agree between initial spell and repeat pipelines for '+kind,async()=>{
  const w=await world(),holder=kind==='ally'?w.target:w.foe,key=kind+':'+holder.id,effect={k:'test',id:'magic-save-defense',label:'Защита от магии',fx:[{stat:'save.magical',mode:'adv',value:1},{stat:'save.magical',mode:'add',value:3}]};
  if(kind==='ally')w.e.tabletopApi.applyFx(holder.id,effect);else w.e.tabletopApi.applyFxFoe(holder,effect);
  const initial=w.e.rollSpecOf(w.spell,{kind:'spell',caster:w.caster,slotLvl:6,target:w.e.targetInfoOf(key)}),first=initial.rows.find(row=>row.type==='save');
  const repeat=w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:true},w.spell.n);
  assert.equal(first.adv,1);assert.equal(repeat.save.adv,first.adv);assert.equal(repeat.save.mod,first.mod);assert.equal(repeat.rows.filter(row=>row.max===20).length,2);
  const mundane=w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:false},'Немагический эффект');assert.equal(mundane.save.adv,0);assert.equal(mundane.save.mod,first.mod-3);
  const opposing={k:'test',id:'opposing-save',label:'Помеха',fx:[{stat:'save.wis',mode:'dis',value:1}]};
  if(kind==='ally')w.e.tabletopApi.applyFx(holder.id,opposing);else w.e.tabletopApi.applyFxFoe(holder,opposing);
  const withDis=w.e.rollSpecOf(w.spell,{kind:'spell',caster:w.caster,slotLvl:6,target:w.e.targetInfoOf(key)}).rows.find(row=>row.type==='save');
  assert.equal(withDis.adv,0);assert.equal(w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:true},w.spell.n).save.adv,withDis.adv);
});
test('magical-save die matches the initial pipeline and remains tracked for consumption on a repeated save',async()=>{
  const w=await world(),key='ally:'+w.target.id,effect={k:'test',id:'magic-die',label:'Кость против магии',fx:[{stat:'save.magical',mode:'die',value:'1d4',consume:'roll'}]};
  w.e.tabletopApi.applyFx(w.target.id,effect);
  const initial=w.e.rollSpecOf(w.spell,{kind:'spell',caster:w.caster,slotLvl:6,target:w.e.targetInfoOf(key)}),first=initial.rows.find(row=>row.type==='save'),repeat=w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:true},w.spell.n);
  assert.equal(initial.rows.filter(row=>row.addTo==='save'&&row.sides===4).length,1);assert.equal(repeat.rows.filter(row=>row.max===4).length,1);assert.ok(repeat.save.consumeTargetFx.includes(effect.uid));
  const values=Object.fromEntries(repeat.rows.map(row=>[row.key,row.max===20?10:4]));assert.equal(repeat.total(values),10+first.mod+4);
});
test('innate magic resistance and an opposing save disadvantage cancel identically for initial and repeated saves',async()=>{
  const w=await world(),key='foe:'+w.foe.id;w.foe.magicRes=true;w.foe.mechanics.defenses.magicResistance=true;
  let initial=w.e.rollSpecOf(w.spell,{kind:'spell',caster:w.caster,slotLvl:6,target:w.e.targetInfoOf(key)}),first=initial.rows.find(row=>row.type==='save'),repeat=w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:true},w.spell.n);
  assert.equal(first.adv,1);assert.equal(repeat.save.adv,1);
  w.e.tabletopApi.applyFxFoe(w.foe,{k:'test',id:'wis-disadvantage',label:'Помеха',fx:[{stat:'save.wis',mode:'dis',value:1}]});
  initial=w.e.rollSpecOf(w.spell,{kind:'spell',caster:w.caster,slotLvl:6,target:w.e.targetInfoOf(key)});first=initial.rows.find(row=>row.type==='save');repeat=w.rt.saveSpec(key,{key:'wis',dc:first.dc,magic:true},w.spell.n);
  assert.equal(first.adv,0);assert.equal(repeat.save.adv,0);
});

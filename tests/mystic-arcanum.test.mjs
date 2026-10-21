import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const success=result=>result===true||result?.success===true||result?.ok===true;
const names={6:'True Seeing',7:'Finger of Death',8:'Dominate Monster',9:'Power Word Kill'};
function world(extra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const c=Object.assign(e.buildBlank(),{id:'arcanum-warlock',name:'Таинственный колдун',cls:'Колдун',subcls:'Исчадие',level:17,
    ab:{str:10,dex:10,con:14,int:10,wis:12,cha:18}},extra);
  const target=Object.assign(e.buildBlank(),{id:'arcanum-target',name:'Цель арканума',hp:120,hpMax:120});
  e.setState({...e.catalogs,chars:[c,target],activeCharId:c.id});a.withoutPresentation();l.quiet();a.characterAdopt(c);a.applyClassSlots(c);a.upgradeSpellcastingState(c);e.guardRandom();
  const spell=name=>e.state().spells.find(sp=>e.grimoireApi.grimoireActive(sp)&&e.grimoireApi.rules.identity(sp)===e.grimoireApi.rules.normalize(name));
  return {e,a,l,c,target,spell,api:e.arcanumApi};
}
function row(w,circle,c=w.c){return w.l.profile(c).arcanum.find(value=>value.circle===circle);}
async function learn(w,circle,name=names[circle]){
  const sp=w.spell(name);assert.ok(sp,name);
  const result=await w.l.select(w.c.id,sp.id,'arcanum',{circle});assert.equal(success(result),true,JSON.stringify(result));return sp;
}
function payment(w){return plain({slots:w.c.slots,magic:w.c.magicResource||null,slotSpent:w.c.characterBuild?.slotSpent||null});}
function castRolls(w,sp,target=w.target,values={}){
  const spec=w.e.rollSpecOf(sp,{kind:'spell',caster:w.c,slotLvl:sp.l,target:w.e.targetInfoOf('ally:'+target.id)}),input={};
  for(const line of spec.rows)input[line.key]=values[line.key]??(line.type==='save'?1:line.cnt||1);
  const outcome=w.e.resolveOutcome(spec,input);return w.a.castFormulaRollsBuild(spec,input,outcome).rolls;
}
async function cast(w,sp,options={}){
  return w.api.cast(sp.id,w.c.id,options.target||'ally:'+w.target.id,'',undefined,options.slot||sp.l+':arcanum',
    options.rolls||castRolls(w,sp),options.extraTargets,options.rollsByTarget,options.input);
}
async function preparedSpell(name,kind){
  const w=world({cls:kind==='arcanum'?'Колдун':'Волшебник',subcls:'',level:15}),sp=w.spell(name);
  if(kind==='arcanum')await learn(w,sp.l,name);
  else {assert.equal(success(await w.l.select(w.c.id,sp.id,'learn')),true);w.c.spellbook.find(entry=>entry.spellId===sp.id).prep=true;}
  const apply=rolls=>kind==='arcanum'?cast(w,sp,{rolls}):w.e.castSpellApply(sp.id,w.c.id,'ally:'+w.target.id,'',undefined,String(sp.l),rolls);
  return {...w,sp,apply};
}

for(const kind of ['slots','arcanum'])test('Finger of Death requires CON and applies full or half damage through '+kind,async()=>{
  for(const [save,expected] of [[1,37],[20,18]]){
    const w=await preparedSpell('Finger of Death',kind),spec=w.e.rollSpecOf(w.sp,{kind:'spell',caster:w.c,slotLvl:7,target:w.e.targetInfoOf('ally:'+w.target.id)});
    assert.match(w.e.grimoireApi.spellCardHTML(w.sp),/Оживление.*вручную/);
    assert.equal(spec.meta.saveKey,'con');assert.equal(spec.meta.half,true);assert.ok(spec.rows.some(row=>row.key==='save'&&row.natural));
    const rolls=castRolls(w,w.sp,w.target,{save,dmg0:7});assert.equal(rolls.saveMade,true);assert.equal(rolls.saveOk,save===20);assert.equal(rolls.dmgTotal,expected);
    const before=w.target.hp;assert.equal(success(await w.apply(rolls)),true);assert.equal(w.target.hp,before-expected);
    assert.equal(kind==='arcanum'?row(w,7).spent:w.c.slots[7].cur===0,true);
  }
});

test('Finger of Death cannot spend a use or deal damage without the required CON result',async()=>{
  const w=await preparedSpell('Finger of Death','arcanum'),before=plain([w.c,w.target]);
  assert.equal(success(await w.apply({dmgTotal:37,dmgRaw:37,dmgType:'некротическая энергия',saveMade:false})),false);assert.deepEqual(plain([w.c,w.target]),before);
});

for(const kind of ['slots','arcanum'])test('Power Word Stun uses current HP only and spends its '+kind+' resource even above 150 HP',async()=>{
  for(const hp of [150,151]){
    const w=await preparedSpell('Power Word Stun',kind);w.target.hp=hp;w.target.hpMax=200;w.target.hpTemp=50;w.target.cond=['Сбитый с ног'];
    w.a.castSpellFx(w.sp.id,w.c.id);assert.match(w.e.elementText('castInfo'),/Повторный спасбросок Телосложения.*вручную/);w.e.closeCastModal();
    const rolls=castRolls(w,w.sp),before=plain(w.target);assert.equal(rolls.saveMade,false,'initial stun has no save');
    const result=await w.apply(rolls);assert.equal(success(result),true);assert.equal(w.target.hp,hp);assert.equal(w.target.hpTemp,50);assert.ok(w.e.effectiveConditions(w.target).includes('Сбитый с ног'));
    assert.equal(w.e.effectiveConditions(w.target).includes('Ошеломленный'),hp===150);
    assert.equal(kind==='arcanum'?row(w,8).spent:w.c.slots[8].cur===0,true);
    if(hp===151){assert.deepEqual(plain(w.target),before);assert.match(w.e.state().lastCastEvent.outcomeNotes.join(' '),/эффекта нет.*151.*150/);if(kind==='arcanum')assert.match(result.message,/эффекта нет/);}
  }
});

test('saved canonical contracts receive the two combat corrections without resetting other fields or hero state',async()=>{
  const w=world({level:15}),finger=w.spell('Finger of Death'),stun=w.spell('Power Word Stun');
  for(const sp of [finger,stun]){delete sp.grimoire.combatRevision;sp.mechanics.special='';sp.notes='Моя заметка';sp.mechanics.spell.targeting.count.base=2;}
  finger.mechanics.resolution.save=null;finger.mechanics.spell.resolution.savingThrow=null;finger.mechanics.spell.input.requireCompleteRolls=false;
  const before=plain(w.c);assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  const f=w.e.grimoireApi.spellOf(finger.id),s=w.e.grimoireApi.spellOf(stun.id);
  assert.equal(f.mechanics.resolution.save.key,'con');assert.equal(f.mechanics.resolution.save.half,true);assert.equal(f.mechanics.spell.resolution.savingThrow.key,'con');assert.equal(s.mechanics.special,'powerWordStun');
  for(const sp of [f,s]){assert.equal(sp.notes,'Моя заметка');assert.equal(sp.mechanics.spell.targeting.count.base,2);}
  assert.deepEqual(plain(w.e.state().chars.find(c=>c.id===w.c.id).mysticArcanum),before.mysticArcanum);
  const corrected=plain([f,s]);w.e.grimoireApi.reconcile(w.e.state().spells,w.e.state().chars);assert.deepEqual(plain([f,s]),corrected,'migration is idempotent');
});

test('combat corrections preserve edited translations, custom cards and editor-origin mechanics',()=>{
  for(const revision of ['current','old','missing'])for(const mark of [sp=>{sp.grimoire.translation='custom';},sp=>{sp.custom=true;},sp=>{sp.mechanics.origin='editor';}]){
    const w=world();for(const name of ['Finger of Death','Power Word Stun']){const sp=w.spell(name);mark(sp);delete sp.grimoire.combatRevision;sp.mechanics.special='';sp.mechanics.resolution.save=null;sp.mechanics.spell.resolution.savingThrow=null;
      if(revision==='old')sp.grimoire.engineRevision='old';if(revision==='missing')delete sp.grimoire.engineRevision;
      const before=plain(sp.mechanics);w.e.grimoireApi.reconcile(w.e.state().spells,[]);assert.deepEqual(plain(sp.mechanics),before);}
  }
});

test('hidden canonical cards receive corrections while staying hidden and restore with corrected mechanics',()=>{
  const w=world();
  for(const name of ['Finger of Death','Power Word Stun']){const sp=w.spell(name);sp.grimoire.hidden=true;delete sp.grimoire.combatRevision;sp.mechanics.special='';sp.mechanics.resolution.save=null;sp.mechanics.spell.resolution.savingThrow=null;
    w.e.grimoireApi.reconcile(w.e.state().spells,[]);assert.equal(sp.grimoire.hidden,true);assert.equal(w.e.grimoireApi.grimoireActive(sp),false);
    w.e.grimoireApi.grimoireRestore(sp.id);assert.equal(w.e.grimoireApi.grimoireActive(sp),true);
    assert.equal(sp.mechanics.special,name==='Finger of Death'?'fingerOfDeath':'powerWordStun');if(name==='Finger of Death')assert.equal(sp.mechanics.resolution.save.key,'con');
  }
});

test('only Warlock levels 11/13/15/17 unlock one arcanum of exactly circles 6/7/8/9',()=>{
  const w=world(),thresholds={6:11,7:13,8:15,9:17};
  for(let level=1;level<=20;level++){
    w.c.level=level;w.c.spellbook=[];delete w.c.mysticArcanum;w.a.upgradeSpellcastingState(w.c);
    assert.equal(w.a.maxCircleFor(w.c),Math.min(5,Math.ceil(level/2)),'ordinary pact casting never reaches circle 6');
    for(const [circle,requiredLevel] of Object.entries(thresholds)){
      const plan=w.l.plan(w.c.id,w.spell(names[circle]).id,'arcanum',{circle:+circle});
      assert.equal(plan.ok,level>=requiredLevel,'level '+level+', circle '+circle);
    }
  }
  for(const cls of ['Волшебник','Бард','Чародей','Жрец','Воин']){
    w.c.cls=cls;w.c.level=20;delete w.c.mysticArcanum;w.a.upgradeSpellcastingState(w.c);
    assert.equal(w.l.plan(w.c.id,w.spell(names[6]).id,'arcanum',{circle:6}).ok,false,cls);
  }
});

test('arcanum rejects foreign class and circle choices, canonicalizes legacy aliases, and cannot bypass ordinary learning',async()=>{
  const w=world({level:13}),six=w.spell(names[6]),seven=w.spell(names[7]);
  assert.equal(w.l.plan(w.c.id,seven.id,'arcanum',{circle:6}).ok,false);
  assert.equal(w.l.plan(w.c.id,six.id,'arcanum',{circle:7}).ok,false);
  assert.equal(w.l.plan(w.c.id,w.spell('Heal').id,'arcanum',{circle:6}).ok,false);
  const alias=w.e.state().spells.find(sp=>sp.grimoire?.status==='alias'&&sp.grimoire.canonicalId===six.id);
  if(alias){const plan=w.l.plan(w.c.id,alias.id,'arcanum',{circle:6});assert.equal(plan.ok,true);assert.equal(plan.spellId,six.id);assert.equal(w.api.candidates(w.c,6).some(sp=>sp.id===alias.id),false);}
  assert.equal(w.l.plan(w.c.id,six.id,'learn').ok,false);
  assert.equal(w.a.spellAddCheck(w.c,six).ok,false);
  const before=w.a.knownSpellCount(w.c);await learn(w,6);await learn(w,7);
  assert.equal(w.a.knownSpellCount(w.c),before,'arcanum never uses or grants ordinary known-spell choices');
  assert.equal(w.l.plan(w.c.id,w.spell('Eyebite').id,'arcanum',{circle:6}).ok,false,'the earned choice is unique');
});

test('legacy Mystic Arcanum cantrip grants retire with notes and original data across save and reload',async()=>{
  const w=world({level:11}),sp=w.spell('Guidance'),ability=w.e.state().abilities.find(ab=>ab.id==='ab_open5e_srd_2014_class_srd_warlock_mystic_arcanum');
  assert.equal(w.api.abilityProfile(ability).binding,'spellbook');
  w.c.abilities.push({abilityId:ability.id,grantedSpell:sp.id});
  const old={spellId:sp.id,access:'feature',granted:true,alwaysPrepared:true,countsAgainstKnown:false,countsAgainstPreparation:false,prep:true,abilityGameplayGrant:ability.id,notes:'Моя заметка о старом выборе'};
  w.c.spellbook.push(plain(old));w.a.upgradeSpellcastingState(w.c);
  const retired=w.c.spellbook.find(entry=>entry.spellId===sp.id);assert.equal(retired.access,'archive');assert.equal(w.a.spellEntryReady(w.c,retired,sp),false);
  assert.equal(retired.notes,old.notes);assert.deepEqual(plain(retired.retiredArcanumGrant),old);
  const grant=w.c.abilities.find(entry=>entry.abilityId===ability.id);assert.equal(grant.grantedSpell,undefined);assert.equal(grant.legacyGrantedSpell,sp.id);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();const loaded=w.e.state().chars.find(c=>c.id===w.c.id),entry=loaded.spellbook.find(entry=>entry.spellId===sp.id);
  assert.equal(entry.access,'archive');assert.equal(w.a.spellEntryReady(loaded,entry,w.e.grimoireApi.spellOf(sp.id)),false);assert.deepEqual(plain(entry.retiredArcanumGrant),old);
});

test('retiring the old arcanum feature preserves both another legitimate grant and genuine learned cantrips',async()=>{
  const w=world({level:11}),sp=w.spell('Guidance'),own=w.spell('Eldritch Blast');
  const legacy='ab_open5e_srd_2014_class_srd_warlock_mystic_arcanum',legitimate='ab_open5e_srd_2014_class_srd_circle_of_the_land_bonus_cantrip';
  w.c.abilities.push({abilityId:legacy,grantedSpell:sp.id},{abilityId:legitimate,grantedSpell:sp.id});
  w.c.spellbook.push({spellId:sp.id,access:'feature',granted:true,alwaysPrepared:true,countsAgainstKnown:false,countsAgainstPreparation:false,prep:true,abilityGameplayGrant:legacy,notes:'Настоящий второй источник'},
    {spellId:own.id,access:'known',prep:true,notes:'Выучено игроком'});
  w.a.upgradeSpellcastingState(w.c);const entry=w.c.spellbook.find(row=>row.spellId===sp.id);
  assert.equal(entry.abilityGameplayGrant,legitimate);assert.equal(w.a.spellEntryReady(w.c,entry,sp),true);assert.equal(entry.notes,'Настоящий второй источник');
  assert.equal(w.a.spellEntryReady(w.c,w.c.spellbook.find(row=>row.spellId===own.id),own),true);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();const loaded=w.e.state().chars.find(c=>c.id===w.c.id);
  for(const id of [sp.id,own.id])assert.equal(w.a.spellEntryReady(loaded,loaded.spellbook.find(row=>row.spellId===id),w.e.grimoireApi.spellOf(id)),true);
  assert.equal(loaded.spellbook.find(row=>row.spellId===own.id).notes,'Выучено игроком');
});

test('a new legitimate cantrip grant can reuse a retired arcanum entry after reload without losing its history',async()=>{
  const w=world({level:11}),sp=w.spell('Guidance'),legacy='ab_open5e_srd_2014_class_srd_warlock_mystic_arcanum',legitimate='ab_open5e_srd_2014_class_srd_circle_of_the_land_bonus_cantrip';
  w.c.abilities.push({abilityId:legacy,grantedSpell:sp.id},{abilityId:legitimate});
  const original={spellId:sp.id,access:'feature',granted:true,alwaysPrepared:true,countsAgainstKnown:false,prep:true,abilityGameplayGrant:legacy,notes:'История моего выбора'};
  w.c.spellbook.push(plain(original));w.a.upgradeSpellcastingState(w.c);assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();
  const loaded=w.e.state().chars.find(c=>c.id===w.c.id);assert.equal(loaded.spellbook.find(row=>row.spellId===sp.id).access,'archive');
  assert.equal(w.e.abilitiesApi.abilityGameplayBind(loaded.id,legitimate,sp.id),true);
  const entry=loaded.spellbook.find(row=>row.spellId===sp.id);assert.equal(entry.abilityGameplayGrant,legitimate);
  assert.equal(w.a.spellEntryReady(loaded,entry,w.e.grimoireApi.spellOf(sp.id)),true);assert.equal(entry.notes,original.notes);assert.deepEqual(plain(entry.retiredArcanumGrant),original);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();const again=w.e.state().chars.find(c=>c.id===w.c.id);
  assert.equal(w.a.spellEntryReady(again,again.spellbook.find(row=>row.spellId===sp.id),w.e.grimoireApi.spellOf(sp.id)),true);
});

test('old payment tokens cannot be reused after deletion, class or level changes, or rest',async()=>{
  // Ordinary deletion is rejected; this also covers repairing a missing legacy book entry from its retained ledger.
  for(const change of [w=>{w.c.spellbook=w.c.spellbook.filter(entry=>entry.spellId!==w.spell(names[7]).id);w.a.upgradeSpellcastingState(w.c);},w=>{w.a.setLevel(12);w.a.setLevel(13);},w=>{w.a.setClass('Воин');w.a.setClass('Колдун');},w=>w.a.longRest()]){
    const w=world({level:13}),sp=await learn(w,7),plan=w.api.payment(w.c,sp,'7:arcanum');assert.equal(plan.ok,true);change(w);
    const before=plain([w.c,w.target]);assert.throws(()=>w.api.commitPayment(w.c,plan));assert.deepEqual(plain([w.c,w.target]),before);
  }
});

test('selection is durable, rejects replay and rolls back a rejected write without consuming its choice',async()=>{
  const w=world({level:11}),sp=w.spell(names[6]),plan=w.l.plan(w.c.id,sp.id,'arcanum',{circle:6}),before=plain(w.c);
  const restore=w.l.persistence(async()=>false);assert.equal(success(await w.l.commit(plan)),false);restore();assert.deepEqual(plain(w.c),before);
  assert.equal(success(await w.l.commit(plan)),true);const selected=plain(w.c);assert.equal(success(await w.l.commit(plan)),false);assert.deepEqual(plain(w.c),selected);
  const saved=await w.l.saved();assert.equal(saved.ok,true);assert.equal(saved.envelope.state.chars[0].mysticArcanum.choices[6].spellId,sp.id);
});

test('stale class, level, spell identity and ledger selection cannot commit an old arcanum plan',async()=>{
  for(const mutate of [w=>{w.c.cls='Воин';},w=>{w.c.level=10;},w=>{w.spell(names[6]).l=7;},w=>{w.c.mysticArcanum.revision++;}]){
    const w=world({level:11}),plan=w.l.plan(w.c.id,w.spell(names[6]).id,'arcanum',{circle:6});assert.equal(plan.ok,true);mutate(w);
    const before=plain(w.c);assert.equal(success(await w.l.commit(plan)),false);assert.deepEqual(plain(w.c),before);
  }
});

for(const mode of ['slots','mp'])test('a real arcanum cast spends only its daily use in '+mode+' and rejects replay or alternate payment',async()=>{
  const w=world({level:13}),sp=await learn(w,7);if(mode==='mp')assert.equal(success(await w.a.magicSwitch('mp')),true);
  const before=payment(w),hp=w.target.hp;
  assert.equal(w.a.slotPlanFor(w.c,sp).mode,'arcanum');assert.equal(w.a.slotPlanFor(w.c,sp,'7:arcanum').mode,'arcanum');
  for(const selector of ['8:arcanum','8','5','ritual'])assert.equal(w.a.slotPlanFor(w.c,sp,selector).ok,false,selector);
  const rolled=castRolls(w,sp),result=await cast(w,sp,{rolls:rolled});assert.equal(success(result),true,JSON.stringify(result));
  assert.equal(w.target.hp,hp-rolled.dmgTotal,'existing spell consequence pipeline applies its entered damage');
  assert.equal(row(w,7).spent,true);assert.deepEqual(payment(w),before);
  const after=plain([w.c,w.target]);assert.equal(success(await cast(w,sp,{rolls:rolled})),false);assert.deepEqual(plain([w.c,w.target]),after);
  assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);assert.equal(w.a.slotPlanFor(w.c,sp,'7').ok,false);
});

test('opening and cancelling the real casting dialogs never spends an arcanum or changes its target',async()=>{
  const w=world({level:13}),sp=await learn(w,7),before=plain([w.c,w.target]);
  w.a.castSpellFx(sp.id,w.c.id);assert.ok(w.e.castState().ctx);w.e.closeCastModal();assert.deepEqual(plain([w.c,w.target]),before);
  w.a.castSpellFx(sp.id,w.c.id);w.e.setElementValue('castTarget','ally:'+w.target.id);w.e.setElementValue('castSlot','7:arcanum');
  await w.e.castConfirm();assert.ok(w.e.castState().spec);w.e.closeCastModal();assert.deepEqual(plain([w.c,w.target]),before);
});

test('a casting dialog opened before a class, level, card or ledger change cannot commit stale results',async()=>{
  for(const mutate of [w=>{w.c.cls='Воин';},w=>{w.c.level=12;},w=>{w.spell(names[7]).n+=' · изменено';},w=>{w.c.mysticArcanum.revision++;}]){
    const w=world({level:13}),sp=await learn(w,7),rolls=castRolls(w,sp);w.a.castSpellFx(sp.id,w.c.id);assert.ok(w.e.castState().ctx.arcanumToken);
    mutate(w);const before=plain([w.c,w.target]);assert.equal(success(await cast(w,sp,{rolls})),false);assert.deepEqual(plain([w.c,w.target]),before);
  }
});

test('malformed persisted daily-use state is blocked rather than being reset to an unspent use',async()=>{
  const w=world({level:13}),sp=await learn(w,7);w.c.mysticArcanum.choices[7].spent='false';const before=plain([w.c,w.target]);
  w.a.upgradeSpellcastingState(w.c);assert.deepEqual(plain([w.c,w.target]),before);assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);
  assert.equal(success(await cast(w,sp)),false);assert.deepEqual(plain([w.c,w.target]),before);
  assert.equal(w.l.plan(w.c.id,w.spell(names[6]).id,'arcanum',{circle:6}).ok,false);
});

test('bad targets and manual-only catalogue spells fail closed before daily use, HP or other resources change',async()=>{
  const w=world({level:13}),six=await learn(w,6),seven=await learn(w,7),before=plain([w.c,w.target]);
  assert.equal(success(await cast(w,seven,{target:'ally:no-such-target'})),false);assert.deepEqual(plain([w.c,w.target]),before);
  assert.equal(success(await cast(w,six,{rolls:{}})),false,'arcanum access cannot invent an unimplemented spell effect');assert.deepEqual(plain([w.c,w.target]),before);
});

test('a rejected durable cast restores target HP and its daily resource and can then be retried',async()=>{
  const w=world({level:13}),sp=await learn(w,7),before=plain([w.c,w.target]),restore=w.l.persistence(async()=>false);
  assert.equal(success(await cast(w,sp)),false);restore();assert.deepEqual(plain([w.c,w.target]),before);
  assert.equal(success(await cast(w,sp)),true);assert.equal(row(w,7).spent,true);assert.ok(w.target.hp<before[1].hp);
  const saved=await w.l.saved();assert.equal(saved.envelope.state.chars.find(c=>c.id===w.c.id).mysticArcanum.choices[7].spent,true);
  assert.equal(saved.envelope.state.chars.find(c=>c.id===w.target.id).hp,w.target.hp);
});

test('deletion, level and class round trips, MP changes and reload cannot refund a spent arcanum',async()=>{
  const w=world({level:13}),sp=await learn(w,7);assert.equal(success(await cast(w,sp)),true);
  w.a.delBookSpell(sp.id);assert.equal(row(w,7).spent,true);assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);
  w.a.setLevel(12);assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);w.a.setLevel(13);assert.equal(row(w,7).spent,true);
  w.a.setClass('Волшебник');assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);w.a.setClass('Колдун');assert.equal(row(w,7).spent,true);
  assert.equal(success(await w.a.magicSwitch('mp')),true);assert.equal(success(await w.a.magicSwitch('slots')),true);assert.equal(row(w,7).spent,true);
  assert.equal(await w.e.saveWorldNow(),true);await w.e.loadAll();const loaded=w.e.state().chars.find(c=>c.id===w.c.id);
  assert.equal(row(w,7,loaded).spent,true);assert.equal(w.a.slotPlanFor(loaded,w.e.grimoireApi.spellOf(sp.id)).ok,false);
});

test('short rest preserves spent uses; long rest refreshes all choices even while their class is archived',async()=>{
  const w=world({level:15}),seven=await learn(w,7),eight=await learn(w,8);
  assert.equal(success(await cast(w,seven)),true);assert.equal(success(await cast(w,eight,{rolls:castRolls(w,eight,w.target,{save:20})})),true);
  assert.equal(row(w,7).spent,true);assert.equal(row(w,8).spent,true);assert.notEqual(w.a.shortRest(),false);
  assert.equal(row(w,7).spent,true);assert.equal(row(w,8).spent,true);
  w.a.setClass('Воин');assert.notEqual(w.a.longRest(),false);w.a.setClass('Колдун');
  assert.equal(row(w,7).spent,false);assert.equal(row(w,8).spent,false);assert.equal(w.a.slotPlanFor(w.c,seven).ok,true);
});

test('arcanum concentration participates in the same cast group and breaking it does not refund daily use',async()=>{
  const w=world({level:15}),sp=await learn(w,8),before=payment(w);
  assert.equal(success(await cast(w,sp,{rolls:castRolls(w,sp,w.target,{save:1})})),true);
  const groups=w.e.combatLifecycleApi.concEntriesOf(w.c.id);assert.ok(groups.length,'concentration uses the ordinary spell group');
  const castIds=groups.map(entry=>entry.a.castId).filter(Boolean);assert.ok(castIds.length);
  w.e.combatLifecycleApi.breakConcentration(w.c,'проверка отмены концентрации');
  assert.equal(w.e.combatLifecycleApi.concEntriesOf(w.c.id).length,0);
  assert.equal(w.target.activeFx?.some(entry=>castIds.includes(entry.castId)),false);
  assert.equal(row(w,8).spent,true);assert.deepEqual(payment(w),before);
});


test('learning the same spell in another class cannot borrow its arcanum flag or erase its spent use',async()=>{
  const w=world({level:13}),sp=await learn(w,7);assert.equal(success(await cast(w,sp)),true);
  w.a.setClass('Волшебник');assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);
  assert.equal(w.l.plan(w.c.id,sp.id,'learn').ok,true);assert.equal(success(await w.l.select(w.c.id,sp.id,'learn')),true);
  const wizard=w.c.spellbook.find(entry=>entry.spellId===sp.id);assert.ok(wizard);wizard.prep=true;
  assert.equal(w.a.spellEntryReady(w.c,wizard,sp),true);assert.notEqual(w.a.slotPlanFor(w.c,sp).mode,'arcanum');
  assert.equal(w.c.mysticArcanum.choices[7].spent,true);w.a.setClass('Колдун');assert.equal(row(w,7).spent,true);assert.equal(w.a.slotPlanFor(w.c,sp).ok,false);
  w.a.setClass('Волшебник');assert.equal(w.c.spellbook.find(entry=>entry.spellId===sp.id).prep,true);
});

test('a declared two-target spell shares one daily use and applies each entered outcome through the ordinary pipeline',async()=>{
  const w=world({level:13}),sp=w.spell(names[7]);
  // Explicit fixture mechanics exercise the generic pipeline; this is not a claim that Finger of Death has two targets.
  sp.custom=true;sp.mechanics.origin='editor';sp.mechanics.target.base=2;sp.mechanics.spell.targeting.count.base=2;
  const target2=Object.assign(w.e.buildBlank(),{id:'arcanum-second-target',name:'Вторая цель',hp:100,hpMax:100});w.e.state().chars.push(target2);
  await learn(w,7);const first=castRolls(w,sp),second=castRolls(w,sp,target2);const before=payment(w);
  assert.equal(success(await cast(w,sp,{rolls:first,extraTargets:['ally:'+target2.id],rollsByTarget:{['ally:'+target2.id]:second}})),true);
  assert.equal(w.target.hp,120-first.dmgTotal);assert.equal(target2.hp,100-second.dmgTotal);assert.equal(row(w,7).spent,true);assert.deepEqual(payment(w),before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
function world(extra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),{cls:'Волшебник',subcls:'Школа Воплощения',level:3,bg:'Мудрец'},extra);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);c.spellbook=[];e.guardRandom();return {e,a,c};
}
async function mode(a,preparation){const result=await a.magicSwitch('mp',preparation);assert.equal(result.success,true,result.message);}
const own=(e,a,c,level=1)=>e.catalogs.spells.find(sp=>+sp.l===level&&sp.c.split(/[,;/]/).map(x=>x.trim()).includes(a.casterMeta(c).abbr));

test('2.1 opens every legal class spell without learning it, including known and third casters',async()=>{
  const {a,c,e}=world();await mode(a,'free');
  for(const cls of ['Волшебник','Жрец','Друид','Паладин','Бард','Чародей','Колдун','Следопыт','Воин','Плут']){
    c.cls=cls;c.subcls=cls==='Воин'?'Мистический рыцарь':cls==='Плут'?'Мистический ловкач':'';c.level=5;a.applyClassSlots(c);
    const entries=a.characterSpellEntries(c);assert.ok(entries.length>5,cls);
    for(const entry of entries){const sp=e.catalogs.spells.find(x=>x.id===entry.spellId);assert.ok(+sp.l<=a.maxCircleFor(c),cls);assert.equal(a.slotPlanFor(c,sp,+sp.l||undefined).ok,true,cls+' '+sp.n);}
    assert.deepEqual(plain(c.spellbook),[],'derivation must not write the classic list');
  }
});

test('2.1 rejects foreign spells, higher circles, premature third casting and paladin cantrips',async()=>{
  const {a,c,e}=world();await mode(a,'free');
  const foreign=e.catalogs.spells.find(sp=>+sp.l===1&&!sp.c.includes('Влш')),high=own(e,a,c,3),before=JSON.stringify(c);
  assert.equal(a.slotPlanFor(c,foreign,1).ok,false);assert.equal(a.slotPlanFor(c,high,3).ok,false);assert.equal(JSON.stringify(c),before);
  c.cls='Воин';c.subcls='Мистический рыцарь';c.level=2;a.applyClassSlots(c);assert.deepEqual(plain(a.characterSpellEntries(c)),[]);
  c.cls='Паладин';c.subcls='';c.level=5;a.applyClassSlots(c);assert.equal(a.characterSpellEntries(c).some(entry=>e.catalogs.spells.find(sp=>sp.id===entry.spellId).l===0),false);
});

test('2.1 casts a spell absent from the wizard book through the same consequences and single MP payment',async()=>{
  const {a,c,e}=world();await mode(a,'free');const spell=e.catalogs.spells.find(sp=>sp.id==='sp_magic_missile');
  const target=Object.assign(e.buildBlank(),{id:'free-target',hp:30,hpMax:30});e.state().chars.push(target);
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:free-target','',undefined,'2',{dmgTotal:12,dmgRaw:12,dmgType:'силовое поле',effectAllowed:true,magicMissile:{die:2,darts:4,total:4}}),true);
  assert.equal(target.hp,18);assert.equal(a.magicPool(c).cur,11);assert.deepEqual(plain(c.spellbook),[]);assert.deepEqual(plain(c.slots),{});
  e.closeCastModal();c.magicResource.spent=c.magicResource.max;const before=JSON.stringify([c,target]);
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:free-target','',undefined,'1',{dmgTotal:9,dmgRaw:9,dmgType:'силовое поле',effectAllowed:true}),false);
  assert.equal(JSON.stringify([c,target]),before);
});

test('2.2 preserves the prepared, known and wizard book distinctions',async()=>{
  const {a,c,e}=world();await mode(a,'class');
  for(const cls of ['Жрец','Друид','Паладин','Бард','Чародей','Колдун','Следопыт','Волшебник']){
    c.cls=cls;c.subcls='';c.level=5;a.applyClassSlots(c);c.spellbook=[];const sp=own(e,a,c);assert.ok(sp,cls);
    assert.equal(a.slotPlanFor(c,sp,1).ok,false,cls+' needs selection');
    const meta=a.casterMeta(c),entry={spellId:sp.id,access:meta.listAccess||(meta.preparation==='book'?'spellbook':meta.preparation),prep:false};c.spellbook=[entry];
    assert.equal(a.slotPlanFor(c,sp,1).ok,meta.preparation==='known',cls+' preparation');entry.prep=true;assert.equal(a.slotPlanFor(c,sp,1).ok,true,cls);
  }
});

test('switching between MP variants and slots preserves exact selections, pending preparation and MP debt',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];c.spellPrepDraft={choices:[sp.id]};c.spellLearning={replacements:1,anyClassChoices:0};
  const selection=()=>JSON.stringify([c.spellbook,c.spellPrepDraft,c.spellLearning]),saved=selection();await mode(a,'class');a.commitSlotPlan(c,a.magicPlan(c,2));
  for(let i=0;i<3;i++){
    await mode(a,'free');assert.equal(a.slotPlanFor(c,sp,1).ok,true);assert.equal(selection(),saved);assert.equal(a.magicPool(c).cur,11);
    a.togglePrep(sp.id);a.delBookSpell(sp.id);a.addSpellFromDB(own(e,a,c,2).id);assert.equal(selection(),saved);
    await mode(a,'class');assert.equal(a.slotPlanFor(c,sp,1).ok,false);assert.equal(selection(),saved);assert.equal(a.magicPool(c).cur,11);
  }
  await mode(a,'free');assert.equal((await a.magicSwitch('slots')).success,true);assert.equal(a.slotPlanFor(c,sp,1).ok,false);await mode(a,'free');assert.equal(a.magicPool(c).cur,11);assert.equal(selection(),saved);
});

test('2.1 rest restores MP without applying dormant preparation; 2.2 long rest activates that plan',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];c.spellPrepDraft={choices:[sp.id]};await mode(a,'free');
  a.commitSlotPlan(c,a.magicPlan(c,2));a.longRest();assert.equal(a.magicPool(c).cur,14);assert.equal(c.spellbook[0].prep,false);assert.deepEqual(plain(c.spellPrepDraft.choices),[sp.id]);
  await mode(a,'class');assert.equal(a.slotPlanFor(c,sp,1).ok,false);a.longRest();assert.equal(a.slotPlanFor(c,sp,1).ok,true);assert.equal(c.spellPrepDraft,undefined);
});

test('empty MP permits only free cantrips or class-authorized out-of-combat rituals',async()=>{
  const {a,c,e}=world();await mode(a,'free');c.magicResource.spent=c.magicResource.max;
  assert.equal(a.slotPlanFor(c,own(e,a,c,0)).mode,'cantrip');assert.equal(a.slotPlanFor(c,own(e,a,c),1).ok,false);
  const ritual=e.catalogs.spells.find(sp=>sp.ritual&&+sp.l===1&&sp.c.includes('Влш'));
  assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,true);assert.deepEqual(plain(c.spellbook),[]);
  e.state().combat.active=true;assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,false);e.state().combat.active=false;
  c.cls='Чародей';a.applyClassSlots(c);const fake={...own(e,a,c),ritual:true};assert.equal(a.slotPlanFor(c,fake,'ritual').ok,false,'MP does not grant ritual casting to sorcerers');
});

test('free access retains previously earned foreign features without granting a foreign catalog',async()=>{
  const {a,c,e}=world({cls:'Бард',level:10});const foreign=e.catalogs.spells.find(sp=>+sp.l===1&&!sp.c.includes('Брд'));
  c.spellbook=[{spellId:foreign.id,anyClassKnown:true,access:'magicalSecrets',source:'Тайны магии'}];await mode(a,'free');
  assert.ok(a.characterSpellEntries(c).some(entry=>entry.spellId===foreign.id));assert.equal(a.slotPlanFor(c,foreign,1).ok,true);
  await mode(a,'class');assert.equal(a.slotPlanFor(c,foreign,1).ok,true);
});

test('sheet and combat derive the same free spell access, and depleted MP blocks combat buttons',async()=>{
  const {a,c,e}=world();await mode(a,'free');let html=a.stSpells(c);assert.match(html,/campaign-mp-access/);assert.match(html,/Весь список класса/);assert.doesNotMatch(html,/onclick="togglePrep|onclick="delBookSpell|Создать и вписать/);
  e.state().combat.order=[{kind:'ally',id:c.id}];e.state().combat.uiGroup='spells';html=a.combatActionsHTML('ally:'+c.id);
  const sp=own(e,a,c);assert.ok(html.includes(sp.n));assert.match(html,/список класса/);c.magicResource.spent=c.magicResource.max;assert.match(a.combatActionsHTML('ally:'+c.id),/Недостаточно MP/);
});

test('free variant export and import preserve MP and classic choices without materializing class entries',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];await mode(a,'free');a.commitSlotPlan(c,a.magicPlan(c,2));
  const data=plain(e.dndWorldExportPayload());assert.equal(data.campaignMagic.preparation,'free');await e.dndWorldImportPayload(data);
  const loaded=e.state().chars[0];assert.equal(e.state().campaignMagic.preparation,'free');assert.equal(a.magicPool(loaded).cur,11);assert.equal(loaded.spellbook.length,1);assert.equal(loaded.spellbook[0].prep,false);assert.ok(a.characterSpellEntries(loaded).length>1);
});

test('failed MP submode persistence rolls back access as well as resources',async()=>{
  const {a,c,e}=world();await mode(a,'class');const before=JSON.stringify(c);a.failBackgroundPersistence();assert.equal((await a.magicSwitch('mp','free')).success,false);assert.equal(e.state().campaignMagic.preparation,'class');assert.equal(JSON.stringify(c),before);
});

test('legacy experimental setting migrates explicitly; unsupported access values fail closed',()=>{
  const {a}=world();assert.equal(a.magicRules.settings({version:1,mode:'mp',preparation:'known',revision:2}).preparation,'free');
  assert.throws(()=>a.magicRules.settings({version:1,mode:'mp',preparation:'all-world',revision:2}));
});

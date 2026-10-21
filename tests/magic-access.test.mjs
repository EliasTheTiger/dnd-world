import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
function world(extra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),{cls:'Волшебник',subcls:'Школа Воплощения',level:3,bg:'Мудрец'},extra);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);c.spellbook=[];e.guardRandom();return {e,a,c};
}
async function mode(a,preparation='class'){const result=await a.magicSwitch('mp',preparation);assert.equal(result.success,true,result.message);}
const own=(e,a,c,level=1)=>e.catalogs.spells.find(sp=>+sp.l===level&&sp.c.split(/[,;/]/).map(x=>x.trim()).includes(a.casterMeta(c).abbr));

test('legacy free mode cannot grant the entire class list to any caster',async()=>{
  const {a,c,e}=world();await mode(a,'free');
  assert.equal(e.state().campaignMagic.preparation,'class');assert.equal(a.magicFreeAccess(),false);
  for(const cls of ['Волшебник','Жрец','Друид','Паладин','Бард','Чародей','Колдун','Следопыт','Воин','Плут']){
    c.cls=cls;c.subcls=cls==='Воин'?'Мистический рыцарь':cls==='Плут'?'Мистический ловкач':'';c.level=5;a.applyClassSlots(c);c.spellbook=[];
    const sp=own(e,a,c);assert.ok(sp,cls);assert.equal(a.slotPlanFor(c,sp,1).ok,false,cls+' requires a personal selection');
    assert.deepEqual(plain(a.characterSpellEntries(c)),[],cls+' does not synthesize learned spells');
  }
});

test('class access rejects foreign spells, higher circles and premature third casting',async()=>{
  const {a,c,e}=world();await mode(a,'free');
  const foreign=e.catalogs.spells.find(sp=>+sp.l===1&&!sp.c.includes('Влш')),high=own(e,a,c,3);
  c.spellbook=[{spellId:foreign.id,access:'spellbook',prep:true},{spellId:high.id,access:'spellbook',prep:true}];const before=JSON.stringify(c);
  assert.equal(a.slotPlanFor(c,foreign,1).ok,false);assert.equal(a.slotPlanFor(c,high,3).ok,false);assert.equal(JSON.stringify(c),before);
  c.cls='Воин';c.subcls='Мистический рыцарь';c.level=2;a.applyClassSlots(c);assert.equal(a.slotPlanFor(c,high,3).ok,false);
  c.cls='Паладин';c.subcls='';c.level=5;a.applyClassSlots(c);assert.equal(a.cantripKnownMax(c),0);
});

test('an unlearned spell changes nothing; a learned prepared spell pays MP exactly once',async()=>{
  const {a,c,e}=world();await mode(a,'free');const spell=e.catalogs.spells.find(sp=>sp.id==='sp_magic_missile');
  const target=Object.assign(e.buildBlank(),{id:'class-target',hp:30,hpMax:30});e.state().chars.push(target);
  const resolved={dmgTotal:12,dmgRaw:12,dmgType:'силовое поле',effectAllowed:true,magicMissile:{die:2,darts:4,total:4}},before=JSON.stringify([c,target]);
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:class-target','',undefined,'2',resolved),false);
  assert.equal(JSON.stringify([c,target]),before,'unlearned spell cannot spend MP or damage the target');
  c.spellbook=[{spellId:spell.id,access:'spellbook',prep:true}];
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:class-target','',undefined,'2',resolved),true);
  assert.equal(target.hp,18);assert.equal(a.magicPool(c).cur,11);assert.equal(c.spellbook.length,1);assert.deepEqual(plain(c.slots),{});
  e.closeCastModal();c.magicResource.spent=c.magicResource.max;const depleted=JSON.stringify([c,target]);
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:class-target','',undefined,'1',resolved),false);
  assert.equal(JSON.stringify([c,target]),depleted);
});

test('MP preserves the prepared, known and wizard book distinctions',async()=>{
  const {a,c,e}=world();await mode(a);
  for(const cls of ['Жрец','Друид','Паладин','Бард','Чародей','Колдун','Следопыт','Волшебник']){
    c.cls=cls;c.subcls='';c.level=5;a.applyClassSlots(c);c.spellbook=[];const sp=own(e,a,c);assert.ok(sp,cls);
    assert.equal(a.slotPlanFor(c,sp,1).ok,false,cls+' needs selection');
    const meta=a.casterMeta(c),entry={spellId:sp.id,access:meta.listAccess||(meta.preparation==='book'?'spellbook':meta.preparation),prep:false};c.spellbook=[entry];
    assert.equal(a.slotPlanFor(c,sp,1).ok,meta.preparation==='known',cls+' preparation');entry.prep=true;assert.equal(a.slotPlanFor(c,sp,1).ok,true,cls);
  }
});

test('legacy access arguments and resource switches preserve selections, pending preparation and MP debt',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];c.spellPrepDraft={choices:[sp.id]};c.spellLearning={replacements:1,anyClassChoices:0};
  const selection=()=>JSON.stringify([c.spellbook,c.spellPrepDraft,c.spellLearning]),saved=selection();await mode(a);a.commitSlotPlan(c,a.magicPlan(c,2));
  for(let i=0;i<3;i++){
    await mode(a,'free');assert.equal(a.slotPlanFor(c,sp,1).ok,false);assert.equal(selection(),saved);assert.equal(a.magicPool(c).cur,11);
    assert.equal((await a.magicSwitch('slots')).success,true);assert.equal(a.slotPlanFor(c,sp,1).ok,false);assert.equal(selection(),saved);
    await mode(a);assert.equal(a.magicPool(c).cur,11);assert.equal(selection(),saved);
  }
});

test('long rest applies a wizard preparation plan even when old data requested free access',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];c.spellPrepDraft={choices:[sp.id]};await mode(a,'free');
  a.commitSlotPlan(c,a.magicPlan(c,2));assert.equal(a.slotPlanFor(c,sp,1).ok,false);
  a.longRest();assert.equal(a.magicPool(c).cur,14);assert.equal(c.spellbook[0].prep,true);
  assert.equal(a.slotPlanFor(c,sp,1).ok,true);assert.equal(c.spellPrepDraft,undefined);
});

test('empty MP permits only learned cantrips and class-authorized rituals from the wizard book',async()=>{
  const {a,c,e}=world();await mode(a,'free');c.magicResource.spent=c.magicResource.max;
  const cantrip=own(e,a,c,0),ritual=e.catalogs.spells.find(sp=>sp.ritual&&+sp.l===1&&sp.c.includes('Влш'));
  assert.equal(a.slotPlanFor(c,cantrip).ok,false);assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,false);
  c.spellbook=[{spellId:cantrip.id,access:'known'},{spellId:ritual.id,access:'spellbook',prep:false}];
  assert.equal(a.slotPlanFor(c,cantrip).mode,'cantrip');assert.equal(a.slotPlanFor(c,own(e,a,c),1).ok,false);
  assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,true);
  e.state().combat.active=true;assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,false);e.state().combat.active=false;
  c.cls='Чародей';a.applyClassSlots(c);const fake={...own(e,a,c),ritual:true};assert.equal(a.slotPlanFor(c,fake,'ritual').ok,false,'MP does not grant ritual casting to sorcerers');
});

test('class access retains foreign spells explicitly earned through bard features',async()=>{
  const {a,c,e}=world({cls:'Бард',level:10});const foreign=e.catalogs.spells.find(sp=>+sp.l===1&&!sp.c.includes('Брд'));
  c.spellbook=[{spellId:foreign.id,anyClassKnown:true,access:'magicalSecrets',source:'Тайны магии'}];await mode(a,'free');
  assert.ok(a.characterSpellEntries(c).some(entry=>entry.spellId===foreign.id));assert.equal(a.slotPlanFor(c,foreign,1).ok,true);
  assert.equal(e.state().campaignMagic.preparation,'class');
});

test('sheet and combat use the same personal spell list and depleted MP blocks casting',async()=>{
  const {a,c,e}=world();await mode(a,'free');const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:true}];
  const sheet=a.stSpells(c);assert.doesNotMatch(sheet,/campaign-mp-access|Весь список класса/);assert.ok(sheet.includes(sp.n));
  e.state().combat.order=[{kind:'ally',id:c.id}];e.state().combat.uiGroup='spells';
  assert.ok(a.combatActionsHTML('ally:'+c.id).includes(sp.n));c.magicResource.spent=c.magicResource.max;
  assert.match(a.combatActionsHTML('ally:'+c.id),/Недостаточно MP/);
});

test('local save and reload preserve MP and personal choices without materializing class entries',async()=>{
  const {a,c,e}=world();const sp=own(e,a,c);c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false}];await mode(a,'free');a.commitSlotPlan(c,a.magicPlan(c,2));
  assert.equal(await e.saveWorldNow(),true);await e.loadAll();
  const loaded=e.state().chars[0];assert.equal(e.state().campaignMagic.preparation,'class');assert.equal(a.magicPool(loaded).cur,11);
  assert.equal(loaded.spellbook.length,1);assert.equal(loaded.spellbook[0].prep,false);assert.equal(a.characterSpellEntries(loaded).length,1);
});

test('failed magic resource switch restores the previous mode and all character resources',async()=>{
  const {a,c,e}=world();const before=JSON.stringify(c);a.failBackgroundPersistence();
  assert.equal((await a.magicSwitch('mp','free')).success,false);
  assert.equal(e.state().campaignMagic.mode,'slots');assert.equal(e.state().campaignMagic.preparation,'class');
  assert.equal(JSON.stringify(e.state().chars[0]),before);
});

test('legacy free and known settings migrate to class rules; invalid settings fail closed without rewriting input',()=>{
  const {a}=world();
  for(const preparation of ['known','free','class']){
    const saved={version:1,mode:'mp',preparation,revision:2},before=JSON.stringify(saved);
    assert.equal(a.magicRules.settings(saved).preparation,'class');assert.equal(JSON.stringify(saved),before);
  }
  assert.throws(()=>a.magicRules.settings({version:1,mode:'mp',preparation:'all-world',revision:2}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
function world(extra={}){const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),{cls:'Волшебник',subcls:'Школа Воплощения',level:3,bg:'Мудрец'},extra);e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);e.guardRandom();return {e,a,c};}
async function mp(a){const r=await a.magicSwitch('mp');assert.equal(r.success,true,r.message);}
function prepare(e,c,id='sp_magic_missile'){const spell=e.catalogs.spells.find(s=>s.id===id);assert.ok(spell,id);c.spellbook=[{id:'prepared',spellId:spell.id,access:'spellbook',prep:true}];return spell;}

test('all spellcasting classes and thirds get a single MP pool matching the value of their class resources',()=>{
  const {a,e}=world();for(const cls of ['Волшебник','Жрец','Друид','Бард','Чародей','Колдун','Паладин','Следопыт','Воин','Плут'])for(let level=1;level<=20;level++){
    const c=Object.assign(e.buildBlank(),{cls,level,subcls:cls==='Воин'?'Мистический рыцарь':cls==='Плут'?'Мистический ловкач':''});a.applyClassSlots(c);const saved=plain(c.slots),max=a.magicRules.value(saved,'max');
    a.magicRules.switchCharacter(c,'mp',[],[cls,c.subcls,level].join('|'));assert.equal(a.magicPool(c).max,max,cls+' '+level);assert.deepEqual(plain(c.slots),{});
    a.magicRules.switchCharacter(c,'slots',[],[cls,c.subcls,level].join('|'));assert.deepEqual(plain(c.slots),saved);
  }
  assert.deepEqual(plain(a.magicRules.costs),[0,2,3,5,6,7,9,10,11,13]);
});
test('switching a wounded party preserves biographies, prepared spells and already spent resources',async()=>{
  const {a,c}=world({hp:4,biography:'История героя'});c.slots[1].cur=2;const before=plain(c);await mp(a);assert.equal(a.magicPool(c).cur,10);assert.equal(c.hp,4);assert.equal(c.biography,before.biography);
  assert.equal((await a.magicSwitch('slots')).success,true);assert.deepEqual(plain(c.slots),before.slots);assert.equal(c.hp,4);assert.equal(c.biography,before.biography);
});
test('MP casting uses the existing spell consequences, upcast level, components and one resource commit',async()=>{
  const {a,c,e}=world();const spell=prepare(e,c);await mp(a);const before=a.magicPool(c).cur;
  const target=Object.assign(e.buildBlank(),{id:'mp-target',hp:30,hpMax:30});e.state().chars.push(target);
  assert.equal(e.castSpellApply(spell.id,c.id,'ally:mp-target','',undefined,'2',{dmgTotal:12,dmgRaw:12,dmgType:'силовое поле',effectAllowed:true,magicMissile:{die:2,darts:4,total:4}}),true);
  assert.equal(target.hp,18);assert.equal(a.magicPool(c).cur,before-3);assert.deepEqual(plain(c.slots),{});
});
test('MP has no per-circle slots and can repeatedly pay for an available spell circle',async()=>{
  const {a,c}=world({level:17});await mp(a);assert.equal(a.magicPool(c).max,107);
  for(let i=0;i<3;i++)a.commitSlotPlan(c,a.magicPlan(c,9));assert.equal(a.magicPool(c).cur,68);assert.deepEqual(plain(c.slots),{});
});
test('insufficient MP, unavailable circles, bad numeric input and repeated commits cannot mutate the hero',async()=>{
  const {a,c,e}=world();const spell=prepare(e,c);await mp(a);const before=JSON.stringify(c);
  for(const input of ['free','1oops','1.5','9','0'])assert.equal(a.slotPlanFor(c,spell,input).ok,false,input);assert.equal(JSON.stringify(c),before);
  const plan=a.magicPlan(c,2);a.commitSlotPlan(c,plan);const after=JSON.stringify(c);assert.throws(()=>a.commitSlotPlan(c,plan));assert.equal(JSON.stringify(c),after);
  c.magicResource.spent=c.magicResource.max;assert.equal(a.magicPlan(c,1).ok,false);
});
test('MP retains class preparation, learning limits and free cantrips and rituals',async()=>{
  const {a,c,e}=world();const spell=prepare(e,c);c.spellbook[0].prep=false;await mp(a);assert.equal(a.slotPlanFor(c,spell,'1').ok,false);
  const ritual=e.catalogs.spells.find(s=>s.ritual&&s.l===1&&/Влш/.test(s.c));c.spellbook=[{spellId:ritual.id,access:'spellbook',prep:false}];assert.equal(a.slotPlanFor(c,ritual,'ritual').ok,true);
  const cantrip=e.catalogs.spells.find(s=>s.l===0&&/Влш/.test(s.c));c.spellbook.push({spellId:cantrip.id,access:'known'});assert.equal(a.slotPlanFor(c,cantrip).mode,'cantrip');assert.equal(a.magicPool(c).spent,0);
});
test('mode switching never refreshes spent high circles or profits from unrepresentable MP remainders',async()=>{
  const {a,c}=world();c.slots[2].cur=0;await mp(a);assert.equal(a.magicPool(c).cur,8);a.commitSlotPlan(c,a.magicPlan(c,2));assert.equal(a.magicPool(c).cur,5);
  for(let i=0;i<4;i++){assert.equal((await a.magicSwitch('slots')).success,true);assert.equal(c.slots[2].cur,0);assert.ok(a.magicRules.value(c.slots)<=5);await mp(a);assert.equal(a.magicPool(c).cur,5);}
});
test('ordinary slot use and restoration continue the same resource debt after returning from MP',async()=>{
  const {a,c}=world();await mp(a);a.commitSlotPlan(c,a.magicPlan(c,2));await a.magicSwitch('slots');const available=a.magicRules.value(c.slots);const lv=Number(Object.keys(c.slots).find(k=>c.slots[k].cur>0));a.commitSlotPlan(c,{mode:'slot',lv});await mp(a);assert.equal(a.magicPool(c).cur,11-a.magicRules.costs[lv]);assert.ok(available<=11);
});
test('warlocks recover their one MP pool on a short rest while full and half casters do not',async()=>{
  for(const cls of ['Колдун','Жрец','Паладин']){const {a,c}=world({cls,subcls:'',level:5});await mp(a);a.commitSlotPlan(c,a.magicPlan(c,1));const before=a.magicPool(c).cur;a.refreshShortRestResources(c);assert.equal(a.magicPool(c).cur,cls==='Колдун'?a.magicPool(c).max:before);}
});
test('long rest restores MP and classic return preserves that recovery; level/class edits do not erase debt',async()=>{
  const {a,c}=world();await mp(a);a.commitSlotPlan(c,a.magicPlan(c,2));a.setLevel(5);assert.equal(a.magicPool(c).max,27);assert.equal(a.magicPool(c).spent,3);a.setClass('Воин');assert.equal(a.magicPool(c).cur,0);a.setClass('Волшебник');assert.equal(a.magicPool(c).spent,3);
  a.longRest();assert.equal(a.magicPool(c).cur,27);await a.magicSwitch('slots');assert.equal(a.magicRules.value(c.slots),27);
});
test('campaign mode change is refused during combat or an open roll without any state change',async()=>{
  const {a,c,e}=world();e.state().combat.active=true;const before=JSON.stringify(c);assert.equal((await a.magicSwitch('mp')).success,false);assert.equal(JSON.stringify(c),before);assert.equal(e.state().campaignMagic.mode,'slots');
  e.state().combat.active=false;a.rollCheck('Магия',2,'skill.Магия');assert.equal((await a.magicSwitch('mp')).success,false);a.rollCancel();
});
test('failed durable mode save rolls back every hero and the campaign setting',async()=>{
  const {a,c,e}=world();const before=JSON.stringify(c),mode=plain(e.state().campaignMagic);a.failBackgroundPersistence();const result=await a.magicSwitch('mp');assert.equal(result.success,false);assert.equal(JSON.stringify(c),before);assert.deepEqual(plain(e.state().campaignMagic),mode);
});
test('export includes the campaign mode and actual MP debt, with no active slots',async()=>{
  const {a,c,e}=world();await mp(a);a.commitSlotPlan(c,a.magicPlan(c,2));const exported=plain(e.dndWorldExportPayload());assert.equal(exported.campaignMagic.mode,'mp');assert.equal(exported.chars[0].magicResource.spent,3);assert.deepEqual(exported.chars[0].slots,{});
  assert.throws(()=>a.magicRules.settings({version:88,mode:'mp'}));
});

test('a cancelled multi-target cast preserves MP and inspiration; two misses share one MP payment',async()=>{
  const {a,c,e}=world({inspiration:true});
  const spell=plain(e.catalogs.spells.find(s=>s.id==='sp_палящий_луч'));spell.id='mp-two-rays';spell.custom=true;spell.mechanics.origin='editor';spell.mechanics.target.base=2;spell.mechanics.spell.targeting.count.base=2;e.state().spells.push(spell);
  c.spellbook=[{spellId:spell.id,prep:true,access:'spellbook'}];
  const first=Object.assign(e.buildBlank(),{id:'ray-first',hp:20,hpMax:20}),second=Object.assign(e.buildBlank(),{id:'ray-second',hp:20,hpMax:20});e.state().chars.push(first,second);await mp(a);a.characterArmInspiration(c.id);
  const open=()=>{a.castSpellFx(spell.id,c.id);e.setElementValue('castTarget','ally:ray-first');e.setElementValue('castSlot','2');e.castConfirm();assert.ok(e.castState().ctx,e.elementText('castErr'));e.castState().ctx.extraTargets=['ally:ray-second'];e.castDistanceSet('near');};
  const firstRoll=()=>{assert.equal(e.castState().spec.rows.find(r=>r.type==='atk').adv,1);e.setElementValue('cf_atk',1);e.setElementValue('cf_atk_2',1);e.castFormulaConfirm();e.castDistanceSet('near');assert.equal(e.castState().ctx.target,'ally:ray-second');assert.equal(e.castState().spec.rows.find(r=>r.type==='atk').adv,0);assert.equal(c.inspiration,true);assert.equal(a.magicPool(c).cur,14);};
  open();firstRoll();e.closeCastModal();assert.equal(c.inspiration,true);assert.equal(a.magicPool(c).cur,14);
  open();firstRoll();e.setElementValue('cf_atk',1);e.castFormulaConfirm();assert.equal(c.inspiration,false,e.elementText('castErr'));assert.equal(c.inspirationSpent,1);assert.equal(a.magicPool(c).cur,11);assert.equal(first.hp,20);assert.equal(second.hp,20);
});

test('holy water consumes silver and MP once, and missing ingredients cannot spend MP',async()=>{
  const {a,c,e}=world({cls:'Жрец',subcls:'Домен Жизни',craftingFacilities:['признанный религиозный обряд'],inventory:[{id:'powder',itemId:'it_silver_powder_25',qty:1}]});await mp(a);
  const plan=e.craftPlanFor(c,'cr_holy_water');assert.equal(plan.ok,true,plan.reason);assert.equal(e.commitCraftPlan(plan).ok,true);assert.equal(a.magicPool(c).cur,12);assert.equal(e.inventoryItemQty(c,'it_silver_powder_25'),0);assert.equal(e.inventoryItemQty(c,'it_holy_water'),1);
  const before=JSON.stringify(c);assert.equal(e.commitCraftPlan(plan).ok,false);assert.equal(JSON.stringify(c),before);
});

test('wizard MP recovery works once per long rest, and classic preparation state survives MP recovery',async()=>{
  const {a,c,e}=world();prepare(e,c);await mp(a);a.commitSlotPlan(c,a.magicPlan(c,2));a.commitSlotPlan(c,a.magicPlan(c,2));a.shortRest();assert.equal(a.magicPool(c).cur,12);assert.equal(c.arcUsed,true);assert.equal(c.spellbook[0].prep,true);a.shortRest();assert.equal(a.magicPool(c).cur,12);a.longRest();assert.equal(a.magicPool(c).cur,14);assert.equal(c.arcUsed,false);
});

test('corrupt imported MP history is rejected before the current campaign can change',async()=>{
  const {a,c,e}=world();await mp(a);const data=plain(e.dndWorldExportPayload()),before=JSON.stringify(c),mode=plain(e.state().campaignMagic);delete data.chars[0].magicResource.baselineSpent;
  await assert.rejects(()=>e.dndWorldImportPayload(data),/история расхода/);assert.equal(JSON.stringify(c),before);assert.deepEqual(plain(e.state().campaignMagic),mode);
});

test('MP sheet has a single pool and no slot editors; its state appears in combat changes',async()=>{
  const {a,c,e}=world();await mp(a);let html=a.stSpells(c);assert.match(html,/magic-pool/);assert.doesNotMatch(html,/class="slot-gem|class="slots-row|onclick="setSlotMax/);
  const entry={kind:'ally',id:c.id};e.state().combat.order=[entry];assert.equal(e.combatSnapshotOf(entry).magic.MP,'14/14');a.commitSlotPlan(c,a.magicPlan(c,1));assert.equal(e.combatSnapshotOf(entry).magic.MP,'12/14');
});

test('new wizard creation uses campaign MP immediately and saves its background independently',async()=>{
  const {a,e}=world();await mp(a);const draft={name:'Эйра',player:'Игрок',race:'Человек',subrace:'',cls:'Волшебник',subcls:'Школа Воплощения',bg:'Солдат',level:3,align:'Истинно нейтральный',biography:'Свободный рассказ о прошлом.',ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},baseAbilities:{str:8,dex:14,con:13,int:15,wis:12,cha:10},abilityMethod:'array',hpMethod:'average',hpRolls:[],buildChoices:{classSkills:['Магия','Анализ'],tools:['Игральные кости'],languages:['Эльфийский']}};
  const completeDraft=Object.assign(e.buildBlank(),draft);a.setDraft(completeDraft);assert.deepEqual(plain(a.characterCreatorErrors(completeDraft)),[]);assert.equal(a.characterCreatorCommit(),true);const created=e.state().chars.at(-1);assert.equal(a.magicPool(created).cur,14);assert.deepEqual(plain(created.slots),{});assert.equal(created.biography,draft.biography);assert.ok(a.characterBackgroundProfile(created).description);
});

test('an unfinished manual spell roll prevents either kind of rest from refreshing MP',async()=>{
  const {a,c,e}=world();const spell=prepare(e,c);await mp(a);a.commitSlotPlan(c,a.magicPlan(c,2));a.castSpellFx(spell.id,c.id);const before=JSON.stringify(c);assert.equal(a.shortRest(),false);assert.equal(a.longRest(),false);assert.equal(JSON.stringify(c),before);e.closeCastModal();
});

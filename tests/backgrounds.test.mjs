import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
function world(overrides={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),{bg:'Солдат',coins:{mm:0,sm:0,em:0,zm:300,pm:0}},overrides);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();a.characterAdopt(c);e.guardRandom();return {e,a,c};
}
function request(a,c,type,overrides={}){return {requestId:type+'-'+a.rules.backgroundState(c).revision,expectedRevision:a.rules.backgroundState(c).revision,type,masterConfirmed:true,...overrides};}
async function start(a,c,value='Инструменты каллиграфа',kind='tool'){
  const r=await a.characterBackgroundAction(c.id,request(a,c,'start-training',{kind,value,mentor:'Подтверждённый наставник'}));assert.equal(r.success,true,r.message);return c.backgroundDevelopment.projects.at(-1);
}

test('all 24 backgrounds have distinct neutral saved descriptions and actionable development suggestions',()=>{
  const {a}=world(),profiles=a.backgrounds.map(b=>a.rules.backgroundProfile(b));assert.equal(profiles.length,24);
  assert.equal(new Set(profiles.map(p=>p.description)).size,24);
  for(const p of profiles){assert.ok(p.description.length>140,p.name);assert.equal(p.goals.length,2);assert.ok(p.suggestedTools.length,p.name);assert.ok(p.source);assert.doesNotMatch(p.description,/\d|Року|Торгар|Септих|родился|родилась|убили|погибли/);}
});

test('description snapshot survives reload and catalogue updates while a new background replaces only the profile',()=>{
  const {a,c}=world();const old=c.backgroundProfile.description;c.backgroundProfile.description='Сохранённая редакция: '+old;c.biography='Личная история';
  a.characterAdopt(c);assert.equal(c.backgroundProfile.description,'Сохранённая редакция: '+old);
  const restored=plain(c);a.characterAdopt(restored);assert.deepEqual(plain(restored.backgroundProfile),plain(c.backgroundProfile));
  a.characterSelectValue('bg','Мудрец');assert.equal(c.backgroundProfile.name,'Мудрец');assert.equal(c.biography,'Личная история');assert.notEqual(c.backgroundProfile.description,old);
});

test('biography is preserved as plain text and cannot grant stats, immunities, XP or executable markup',()=>{
  const {a,c,e}=world();const before=plain(c);const text='<img src=x onerror=alert(1)>\nСила 30. Иммунитет к огню. Опыт +100000.';
  a.characterBiographySet(text);assert.equal(c.biography,text);const after=plain(c);delete before.biography;delete after.biography;assert.deepEqual(after,before);
  assert.equal(a.dmgAfterTraits(c,10,'огонь',{}).amount,10);assert.doesNotMatch(a.stBackground(c),/<img src=x/);assert.match(a.stNotes(c),/&lt;img/);
  const saved=plain(e.dndWorldExportPayload());assert.ok(JSON.stringify(saved).includes('Иммунитет к огню'));
});

test('incomplete or stale development requests leave character and economy untouched',async()=>{
  const {a,c}=world();const before=JSON.stringify(c),money=JSON.stringify(a.economyState());
  for(const extra of [{masterConfirmed:false},{expectedRevision:3},{mentor:''}]){
    const r=await a.characterBackgroundAction(c.id,request(a,c,'start-training',{kind:'tool',value:'Инструменты каллиграфа',mentor:'Наставник',...extra}));assert.equal(r.success,false);
    assert.equal(JSON.stringify(c),before);assert.equal(JSON.stringify(a.economyState()),money);
  }
});

test('training commits gold and time once and grants a usable proficiency exactly at 250 days',async()=>{
  const {a,c,e}=world(),p=await start(a,c,'Инструменты кузнеца'),one=request(a,c,'train',{projectId:p.id,days:249,startDay:1});
  let r=await a.characterBackgroundAction(c.id,one);assert.equal(r.success,true,r.message);assert.equal(e.coinCopperTotal(c),5100);assert.ok(!c.toolProficiencies.includes(p.value));
  const after=JSON.stringify(c);r=await a.characterBackgroundAction(c.id,one);assert.equal(r.replayed,true);assert.equal(JSON.stringify(c),after);
  r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,days:1,startDay:250}));assert.equal(r.success,true,r.message);assert.equal(e.coinCopperTotal(c),5000);
  assert.ok(c.toolProficiencies.includes(p.value));assert.equal(a.toolProficiencyHas(c,{prof:p.value}),true);assert.equal(c.backgroundDevelopment.projects[0].status,'complete');
  const smith=e.catalogs.items.find(it=>it.id==='it_tool_smith'),check=a.toolTaskCheckSpec(c,smith);assert.equal(check.owns,true);assert.equal(check.mod-check.base,2);assert.ok(!c.inventory.some(it=>it.itemId===smith.id),'training does not create equipment');
  a.setLevel(5);const advanced=a.toolTaskCheckSpec(c,smith);assert.equal(advanced.mod-advanced.base,3,'earned proficiency scales with character development');
  assert.equal(a.economyState().operations.length,2);
  a.characterSelectValue('bg','Аколит');assert.ok(c.toolProficiencies.includes(p.value),'earned training survives changing background');
});

test('training rejects repeated periods, fractional days, overspending and already-owned choices without mutation',async()=>{
  const {a,c}=world(),p=await start(a,c);
  assert.equal((await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,days:2,startDay:1}))).success,true);
  for(const change of [{days:1,startDay:2},{days:1.5,startDay:3},{days:249,startDay:3}]){const before=JSON.stringify(c);const r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,...change}));assert.equal(r.success,false);assert.equal(JSON.stringify(c),before);}
  c.coins={mm:0,sm:0,em:0,zm:0,pm:0};const before=JSON.stringify(c),money=JSON.stringify(a.economyState());
  const r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,days:1,startDay:3}));assert.equal(r.success,false);assert.match(r.message,/монет/);assert.equal(JSON.stringify(c),before);assert.equal(JSON.stringify(a.economyState()),money);
});

test('failed durable save rolls back payment, training progress and the new proficiency',async()=>{
  const {a,c,e}=world(),p=await start(a,c),before=JSON.stringify(c),economy=JSON.stringify(a.economyState());a.failBackgroundPersistence();
  const r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,days:250,startDay:1}));assert.equal(r.success,false);assert.equal(JSON.stringify(c),before);assert.equal(JSON.stringify(a.economyState()),economy);assert.equal(e.coinCopperTotal(c),30000);
});

test('completed language training remains known after changing race and background',async()=>{
  const {a,c}=world(),p=await start(a,c,'Драконий','language');
  const r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:p.id,days:250,startDay:1}));assert.equal(r.success,true,r.message);assert.ok(c.langs.includes('Драконий'));
  a.setRace('Эльф');a.characterSelectValue('bg','Мудрец');assert.ok(c.langs.includes('Драконий'));
});

test('training is blocked during combat or incapacity and cannot open parallel courses',async()=>{
  const {a,c,e}=world();c.hp=0;let r=await a.characterBackgroundAction(c.id,request(a,c,'start-training',{kind:'language',value:'Драконий',mentor:'Учитель'}));assert.equal(r.success,false);
  c.hp=10;await start(a,c);const before=JSON.stringify(c);r=await a.characterBackgroundAction(c.id,request(a,c,'start-training',{kind:'language',value:'Драконий',mentor:'Учитель'}));assert.equal(r.success,false);assert.equal(JSON.stringify(c),before);
  e.state().combat.active=true;r=await a.characterBackgroundAction(c.id,request(a,c,'train',{projectId:c.backgroundDevelopment.projects[0].id,days:1,startDay:1}));assert.equal(r.success,false);assert.equal(JSON.stringify(c),before);
});

test('background milestones award non-stacking inspiration, reject duplicate events and preserve the ledger after respec',async()=>{
  const {a,c}=world(),r=request(a,c,'milestone',{goal:0,session:'Сессия 1',note:'Осмысленный поступок по выбранному направлению',awardInspiration:true});
  assert.equal((await a.characterBackgroundAction(c.id,r)).success,true);assert.equal(c.inspiration,true);assert.equal((await a.characterBackgroundAction(c.id,r)).replayed,true);
  const before=JSON.stringify(c);assert.equal((await a.characterBackgroundAction(c.id,request(a,c,'milestone',{...r,requestId:'duplicate',expectedRevision:1,awardInspiration:false}))).success,false);assert.equal(JSON.stringify(c),before);
  assert.equal((await a.characterBackgroundAction(c.id,request(a,c,'milestone',{goal:1,session:'Сессия 2',note:'Другой поступок',awardInspiration:true}))).success,false);
  a.characterSelectValue('bg','Мудрец');assert.equal(c.backgroundDevelopment.events.length,1);assert.equal(c.backgroundDevelopment.events[0].background,'Солдат');
});

test('inspiration is selected before a check, survives cancellation and bad dice, then is spent once',()=>{
  const {a,c,e}=world({inspiration:true});assert.equal(a.characterArmInspiration(c.id),true);a.rollCheck('Атлетика',2,'skill.Атлетика');assert.equal(e.castState().spec.rows.length,2);
  a.rollCancel();assert.equal(c.inspiration,true);assert.ok(a.characterInspirationEffect(c));
  a.rollCheck('Атлетика',2,'skill.Атлетика');e.setElementValue('rollV0',21);e.setElementValue('rollV1',10);assert.equal(a.rollDone(),false);assert.equal(c.inspiration,true);
  e.setElementValue('rollV0',5);e.setElementValue('rollV1',15);a.rollDone();assert.equal(c.inspiration,false);assert.equal(c.inspirationSpent,1);assert.match(e.elementText('diceOut'),/= 17/);
  a.rollDone();assert.equal(c.inspirationSpent,1);
});

test('armed inspiration cancels disadvantage without stacking and does not affect damage rolls',()=>{
  const {a,c,e}=world({inspiration:true});c.activeFx=[{uid:'dis-check',k:'test',id:'test',label:'Помеха',fx:[{stat:'check',mode:'dis',value:1}]}];a.characterArmInspiration(c.id);
  a.rollCheck('Атлетика',2,'skill.Атлетика');assert.equal(e.castState().spec.rows.length,1);e.setElementValue('rollV0',12);a.rollDone();assert.equal(c.inspiration,false);
  c.inspiration=true;a.characterArmInspiration(c.id);const spec=a.finalizeRollSpec({rows:[{key:'damage',type:'dmg',cnt:1,sides:6}],meta:{caster:c}});assert.equal(spec.rows[0].inspirationUid,undefined);
});

test('weapon attack formula includes inspiration, requires both real d20s and builds a single resource consumption',()=>{
  const {a,c,e}=world({inspiration:true});a.characterArmInspiration(c.id);
  const target=Object.assign(e.buildBlank(),{id:'target',hp:20,hpMax:20});e.state().chars.push(target);
  const weapon=e.catalogs.items.find(it=>it.type==='weapon'&&/кинжал/i.test(it.n));assert.ok(weapon);const entry={id:'dagger-entry',itemId:weapon.id,qty:1};c.inventory.push(entry);
  a.weaponAttackFx(entry.id,c.id,'melee');e.setElementValue('castTarget','ally:target');e.castConfirm();e.castDistanceSet('near');
  const spec=e.castState().spec;assert.equal(spec.rows.find(r=>r.type==='atk').adv,1);
  const vals={atk:2,atk_2:3},out=e.resolveOutcome(spec,vals);assert.equal(out.hit,false);
  assert.equal(e.validateFormulaValues(spec,{atk:2},e.resolveOutcome(spec,{atk:2})).ok,false);
  const built=a.castFormulaRollsBuild(spec,vals,out);assert.equal(built.ok,true,built.reason);const rolls=built.rolls||built;assert.equal(rolls.consumeCasterFx.filter(s=>s.startsWith('inspiration:')).length,1);
  assert.equal(c.inspiration,true);e.setElementValue('cf_atk',2);e.setElementValue('cf_atk_2',3);e.castFormulaConfirm();assert.equal(c.inspiration,false,e.elementText('castErr'));assert.equal(target.hp,20);
});

test('specific tool and gaming proficiencies resolve catalogue aliases without granting every game',()=>{
  const {a,c,e}=world({bg:'Аколит'}),cook=e.catalogs.items.find(it=>it.id==='it_tool_cook'),cards=e.catalogs.items.find(it=>it.id==='it_playing_cards');
  c.toolProficiencies=['Инструменты повара','Игральные кости'];assert.equal(a.toolTaskCheckSpec(c,cook).owns,true);assert.equal(a.toolTaskCheckSpec(c,cards).owns,false);
  c.toolProficiencies=['Карты'];assert.equal(a.toolTaskCheckSpec(c,cards).owns,true);assert.equal(e.itemProfile(cards).tool.prof,'Игральный набор','catalogue is not mutated during a check');
});

test('inspiration and Guidance apply to a real tool check, cancel disadvantage and spend only after valid dice',()=>{
  const {a,c,e}=world({inspiration:true}),smith=e.catalogs.items.find(it=>it.id==='it_tool_smith');c.toolProficiencies=['Инструменты кузнеца'];c.inventory.push({id:'smith-entry',itemId:smith.id,qty:1});
  c.activeFx=[{uid:'tool-dis',k:'test',id:'dis',label:'Помеха',fx:[{stat:'check',mode:'dis',value:1}]},{uid:'tool-guidance',k:'test',id:'guidance',label:'Указание',fx:[{stat:'check',mode:'die',value:'1d4',consume:'roll'}]}];
  a.characterArmInspiration(c.id);a.toolCheck('smith-entry');const rows=e.castState().spec.rows;assert.equal(rows.length,2);assert.equal(rows[0].key,'a');assert.equal(rows[1].key,'e0','advantage and disadvantage cancel; second row is Guidance, not another d20');
  e.setElementValue('rollV0',12);e.setElementValue('rollV1',5);assert.equal(a.rollDone(),false);assert.equal(c.inspiration,true);
  const expected=12+a.toolTaskCheckSpec(c,smith).mod+3;e.setElementValue('rollV1',3);a.rollDone();assert.match(e.elementText('diceOut'),new RegExp('= '+expected));assert.equal(c.inspiration,false);assert.ok(!c.activeFx.some(f=>f.uid==='tool-guidance'));assert.ok(c.activeFx.some(f=>f.uid==='tool-dis'));
});

test('target saving throw uses and spends only the target inspiration and rejects a stale selection',()=>{
  const {a,c,e}=world({inspiration:true});a.characterArmInspiration(c.id);const caster=Object.assign(e.buildBlank(),{id:'caster',inspiration:true});e.state().chars.push(caster);a.characterArmInspiration(caster.id);
  const spell={id:'saving-throw-test',n:'Проверка огня',l:1,cm:'—',d:'Мгновенная',x:'Цель совершает спасбросок Ловкости.'};
  const spec=e.rollSpecOf(spell,{caster,kind:'spell',slotLvl:1,target:e.targetInfoOf('ally:'+c.id)}),row=spec.rows.find(r=>r.type==='save');assert.equal(row.adv,1);assert.equal(row.inspirationUid,a.characterInspirationEffect(c).uid);
  const vals={save:20,save_2:19},out=e.resolveOutcome(spec,vals,{}),built=a.castFormulaRollsBuild(spec,vals,out);assert.equal(built.ok,true,built.reason);assert.equal(built.rolls.consumeCasterFx.length,0);assert.equal(built.rolls.consumeTargetFx.length,1);
  c.inspiration=false;assert.equal(e.validateFormulaValues(spec,vals,out).ok,false);c.inspiration=true;
  a.consumeRollFx(c,built.rolls.consumeTargetFx);assert.equal(c.inspiration,false);assert.equal(caster.inspiration,true);
});

test('opposed checks and optional after-hit attack rolls actually receive the selected inspiration',()=>{
  const {a,c,e}=world({inspiration:true});a.characterArmInspiration(c.id);
  const target=Object.assign(e.buildBlank(),{id:'opponent'});e.state().chars.push(target);
  const contest={n:'Состязание',x:'Вы и ваша цель совершаете противопоставленные проверки Атлетики.'};
  let spec=e.rollSpecOf(contest,{caster:c,kind:'ability',target:e.targetInfoOf('ally:opponent')});assert.equal(spec.rows.find(r=>r.type==='check').adv,1);assert.equal(spec.rows.find(r=>r.type==='tcheck').adv,0);
  spec=a.finalizeRollSpec({rows:[{key:'atk',type:'atk',side:'caster',natural:true,adv:0,optional:true}],meta:{caster:c,target:e.targetInfoOf('ally:opponent'),afterHit:true}});assert.equal(spec.rows[0].adv,1);
  const skipped=a.castFormulaRollsBuild(spec,{},e.resolveOutcome(spec,{},{}));assert.equal(skipped.ok,true);assert.equal(skipped.rolls.consumeCasterFx.length,0,'no fresh attack was rolled, so inspiration stays available');
});

test('a batch of spell attacks reserves inspiration for one roll without spending before the shared commit',()=>{
  const {a,c,e}=world({cls:'Волшебник',subcls:'Школа Воплощения',level:3,inspiration:true});
  const spell=plain(e.catalogs.spells.find(s=>s.id==='sp_палящий_луч'));spell.id='test-two-ray-spell';spell.n='Двойной огненный луч';spell.custom=true;spell.mechanics.origin='editor';spell.mechanics.target.base=2;spell.mechanics.spell.targeting.count.base=2;e.state().spells.push(spell);
  c.spellbook=[{id:'prepared-ray',spellId:spell.id,prep:true,access:'spellbook'}];c.slots[2]={max:2,cur:2};
  const first=Object.assign(e.buildBlank(),{id:'ray-first',hp:20,hpMax:20}),second=Object.assign(e.buildBlank(),{id:'ray-second',hp:20,hpMax:20});e.state().chars.push(first,second);a.characterArmInspiration(c.id);
  const open=()=>{a.castSpellFx(spell.id,c.id);e.setElementValue('castTarget','ally:ray-first');e.setElementValue('castSlot','2');e.castConfirm();assert.ok(e.castState().ctx,e.elementText('castErr'));e.castState().ctx.extraTargets=['ally:ray-second'];e.castDistanceSet('near');};
  const firstRoll=()=>{assert.equal(e.castState().spec.rows.find(r=>r.type==='atk').adv,1);e.setElementValue('cf_atk',1);e.setElementValue('cf_atk_2',1);e.castFormulaConfirm();e.castDistanceSet('near');assert.equal(e.castState().ctx.target,'ally:ray-second');assert.equal(e.castState().spec.rows.find(r=>r.type==='atk').adv,0,'second attack cannot reuse inspiration');assert.equal(c.inspiration,true);assert.equal(c.slots[2].cur,2);};
  open();firstRoll();e.closeCastModal();assert.equal(c.inspiration,true);assert.equal(c.slots[2].cur,2,'cancelling a prepared batch leaves all resources');
  open();firstRoll();e.setElementValue('cf_atk',1);e.castFormulaConfirm();assert.equal(c.inspiration,false,e.elementText('castErr'));assert.equal(c.inspirationSpent,1);assert.equal(c.slots[2].cur,1);assert.equal(first.hp,20);assert.equal(second.hp,20);
});

test('spell preflight rejects duplicate inspiration in separate target results before committing anything',()=>{
  const {a,c}=world({inspiration:true});a.characterArmInspiration(c.id);const id=a.characterInspirationEffect(c).uid,roll={consumeCasterFx:[id],consumeTargetFx:[]},before=JSON.stringify(c);
  const check=a.spellRollPreflight({input:{}},['ally:first','ally:second'],roll,{'ally:second':plain(roll)});assert.equal(check.ok,false);assert.equal(JSON.stringify(c),before);
});

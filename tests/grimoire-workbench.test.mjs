import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
function world(extra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,g=e.grimoireApi;
  const c=Object.assign(e.buildBlank(),{cls:'Волшебник',subcls:'Школа Воплощения',level:5},extra);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);a.upgradeSpellcastingState(c);e.guardRandom();
  const spell=name=>e.state().spells.find(sp=>g.grimoireActive(sp)&&g.rules.identity(sp)===g.rules.normalize(name));
  return {e,a,g,c,spell};
}

test('new Life clerics receive the full level-gated domain list without using preparation choices',()=>{
  const {a,c,spell}=world({cls:'Жрец',subcls:'Домен Жизни',level:9});
  const grants=c.spellbook.filter(e=>e.subclassSpellGrant);
  assert.equal(grants.length,10);assert.ok(grants.every(e=>e.alwaysPrepared&&e.countsAgainstPreparation===false));
  const count=a.prepCount(c);for(const entry of grants)entry.prep=false;
  a.upgradeSpellcastingState(c);assert.equal(a.prepCount(c),count);
  assert.equal(a.slotPlanFor(c,spell('Raise Dead'),5).ok,true);
  c.level=1;a.applyClassSlots(c);a.upgradeSpellcastingState(c);
  assert.equal(c.spellbook.filter(e=>e.subclassSpellGrant).length,2);
  assert.equal(a.slotPlanFor(c,spell('Raise Dead'),5).ok,false);
});

test('Devotion grants foreign class spells at paladin levels, not full-caster levels; changing oath removes access',()=>{
  const {a,c,spell}=world({cls:'Паладин',subcls:'Клятва Преданности',level:5});
  assert.equal(c.spellbook.filter(e=>e.subclassSpellGrant).length,4);
  assert.equal(a.slotPlanFor(c,spell('Sanctuary'),1).ok,true);
  assert.equal(a.slotPlanFor(c,spell('Beacon of Hope'),3).ok,false);
  c.subcls='Клятва Мести';a.upgradeSpellcastingState(c);
  assert.equal(a.slotPlanFor(c,spell('Sanctuary'),1).ok,false);
  assert.equal(c.spellbook.some(e=>e.subclassSpellGrant),false);
});

test('subclass grant migration preserves independent entries, resource debt and manually authored biography',()=>{
  const {a,c,spell}=world({cls:'Паладин',subcls:'',level:5});
  const sp=spell('Sanctuary'),entry={spellId:sp.id,access:'feat',granted:true,prep:true,source:'Решение мастера',notes:'Сохранить'};
  c.spellbook.push(plain(entry));c.slots[1].cur=1;c.biography='Личная биография';
  c.subcls='Клятва Преданности';a.upgradeSpellcastingState(c);
  for(let i=0;i<3;i++)a.upgradeSpellcastingState(c);
  assert.equal(c.spellbook.filter(e=>e.spellId===sp.id).length,1);
  c.subcls='';a.upgradeSpellcastingState(c);
  assert.deepEqual(plain(c.spellbook.find(e=>e.spellId===sp.id)),entry);
  assert.equal(c.slots[1].cur,1);assert.equal(c.biography,'Личная биография');
});

test('all seven SRD lands grant eight canonical spells at level 9 and only two at level 3',()=>{
  const {a,g,c}=world({cls:'Друид',subcls:'Круг Земли',level:9});
  for(const land of Object.keys(a.magicRules.landSpells)){
    assert.equal(g.circleLandSet(c.id,land),true);assert.equal(c.spellbook.filter(e=>e.subclassSpellGrant).length,8,land);
    for(const entry of c.spellbook.filter(e=>e.subclassSpellGrant))assert.equal(a.slotPlanFor(c,g.spellOf(entry.spellId)).ok,true,land);
  }
  c.level=3;a.applyClassSlots(c);a.upgradeSpellcastingState(c);assert.equal(c.spellbook.filter(e=>e.subclassSpellGrant).length,2);
  assert.equal(a.cantripKnownMax(c),3);c.subcls='Круг Луны';a.upgradeSpellcastingState(c);assert.equal(a.cantripKnownMax(c),2);
});

test('Fiend expanded spells must be learned in classic and MP 2.2, but belong to the full class list in MP 2.1',async()=>{
  const {a,c,spell}=world({cls:'Колдун',subcls:'Исчадие',level:5}),fireball=spell('Fireball');
  assert.equal(c.spellbook.some(e=>e.spellId===fireball.id),false);
  assert.equal(a.spellAddCheck(c,fireball).ok,true);assert.equal(a.slotPlanFor(c,fireball).ok,false);
  await a.magicSwitch('mp','free');assert.equal(a.slotPlanFor(c,fireball,3).ok,true);assert.deepEqual(plain(c.spellbook),[]);
  await a.magicSwitch('mp','class');assert.equal(a.slotPlanFor(c,fireball,3).ok,false);
  a.addSpellFromDB(fireball.id);assert.equal(a.knownSpellCount(c),1);assert.equal(a.slotPlanFor(c,fireball,3).ok,true);
  c.subcls='Архифея';a.upgradeSpellcastingState(c);assert.equal(a.slotPlanFor(c,fireball,3).ok,false);
});

test('Lore bard gets exactly two extra choices including a cantrip, independent of ordinary known limits',()=>{
  const {a,c,spell}=world({cls:'Бард',subcls:'Коллегия Знаний',level:6}),before=a.knownSpellCount(c);
  a.addSpellFromDB(spell('Fireball').id,{loreSecret:true});a.addSpellFromDB(spell('Fire Bolt').id,{loreSecret:true});
  assert.equal(a.loreSecretRemaining(c),0);assert.equal(a.knownSpellCount(c),before);assert.equal(a.cantripKnownCount(c),0);
  assert.equal(a.slotPlanFor(c,spell('Fireball'),3).ok,true);assert.equal(a.slotPlanFor(c,spell('Fire Bolt')).ok,true);
  const saved=JSON.stringify(c);a.addSpellFromDB(spell('Magic Missile').id,{loreSecret:true});assert.equal(JSON.stringify(c),saved);
  c.level=5;a.applyClassSlots(c);assert.equal(a.slotPlanFor(c,spell('Fire Bolt')).ok,false);
  c.level=6;c.subcls='Коллегия Доблести';assert.equal(a.slotPlanFor(c,spell('Fireball')).ok,false);
  c.spellbook.forEach(entry=>{entry.access='archive';delete entry.granted;});c.subcls='Коллегия Знаний';a.upgradeSpellcastingState(c);
  assert.equal(a.slotPlanFor(c,spell('Fireball')).ok,true);assert.equal(a.loreSecretRemaining(c),0);
});

test('choosing an already-known spell during replacement cannot delete the old choice or spend a replacement',()=>{
  const {a,c,spell}=world({cls:'Чародей',subcls:'',level:3});
  a.addSpellFromDB(spell('Magic Missile').id);a.addSpellFromDB(spell('Burning Hands').id);c.spellLearning.replacements=1;
  a.beginKnownSpellReplacement(c,spell('Magic Missile').id);const before=JSON.stringify(c);
  a.addSpellFromDB(spell('Burning Hands').id);assert.equal(JSON.stringify(c),before);
});

for(const [cls,subcls,key] of [['Волшебник','Школа Воплощения','arcUsed'],['Друид','Круг Земли','naturalRecoveryUsed']]){
  test(cls+' recovers the player-selected third-circle slot, once per long rest; invalid choice changes nothing',()=>{
    const {a,c}=world({cls,subcls,level:5});c.slots[1].cur=0;c.slots[3].cur=0;
    c.characterBuild.slotSpent={1:4,3:2};const before=JSON.stringify(c);
    assert.equal(a.shortRest([3,1]),false);assert.equal(JSON.stringify(c),before);
    assert.equal(a.shortRest([3]),true);assert.equal(c.slots[3].cur,1);assert.equal(c.slots[1].cur,0);assert.equal(c[key],true);assert.equal(c.characterBuild.slotSpent[3],1);
    const used=JSON.stringify(c);assert.equal(a.shortRest([1]),false);assert.equal(JSON.stringify(c),used);
    a.longRest();assert.equal(c[key],false);
  });
}

test('short-rest recovery forbids sixth-circle slots, over-recovery, fractions and wrong-class powers',()=>{
  const {a,c}=world({level:20});c.slots[6].cur=0;c.slots[1].cur=0;
  for(const choice of [[6],[1,1,1,1,1],[1.5],['1'],[]]){const before=JSON.stringify(c);assert.equal(a.shortRest(choice),false);assert.equal(JSON.stringify(c),before);}
  c.cls='Чародей';assert.equal(a.shortRest([1]),false);
});

test('Land druid MP recovery is tied to short rest and cannot be repeated by switching modes',async()=>{
  const {a,c}=world({cls:'Друид',subcls:'Круг Земли',level:5});await a.magicSwitch('mp','class');a.commitSlotPlan(c,a.magicPlan(c,3));a.commitSlotPlan(c,a.magicPlan(c,3));
  assert.equal(a.shortRest(6),true);assert.equal(a.magicPool(c).spent,4);assert.equal(c.naturalRecoveryUsed,true);
  await a.magicSwitch('slots');await a.magicSwitch('mp','free');const before=JSON.stringify(c);assert.equal(a.shortRest(1),false);assert.equal(JSON.stringify(c),before);a.longRest();assert.equal(c.naturalRecoveryUsed,false);
});

test('GM preview explains book/preparation/resource/ritual/state separately without changing any character',()=>{
  const {a,g,c,spell}=world(),sp=spell('Magic Missile'),ritual=spell('Detect Magic');c.spellbook=[];
  assert.equal(g.grimoireSpellStatus(c,sp).code,'learn');
  c.spellbook=[{spellId:sp.id,access:'spellbook',prep:false},{spellId:ritual.id,access:'spellbook',prep:false}];
  assert.equal(g.grimoireSpellStatus(c,sp).code,'prepare');c.spellbook[0].prep=true;
  assert.equal(g.grimoireSpellStatus(c,sp).canOpen,true);Object.values(c.slots).forEach(s=>s.cur=0);
  assert.equal(g.grimoireSpellStatus(c,sp).code,'resource');assert.equal(g.grimoireSpellStatus(c,ritual).code,'ritual');
  const before=JSON.stringify(c);g.grimoireSpellStatus(c,sp);g.casterGuideHTML(c);assert.equal(JSON.stringify(c),before);
});

test('GM cast opens the real flow, respects blocked manual spells and cannot bypass combat action economy',()=>{
  const {e,g,c,spell}=world(),sp=spell('Magic Missile');c.spellbook=[{spellId:sp.id,access:'spellbook',prep:true}];g.desk.actorId=c.id;
  const before=JSON.stringify(c);assert.equal(g.grimoireOpenCast(sp.id),true);assert.equal(JSON.stringify(c),before);assert.equal(e.castState().ctx.spellId,sp.id);e.closeCastModal();
  e.state().combat.active=true;assert.equal(g.grimoireOpenCast(sp.id),false);assert.equal(e.castState().ctx,null);e.state().combat.active=false;
  const manual=e.state().spells.find(x=>g.grimoireActive(x)&&x.mechanics?.mode==='manual');assert.equal(g.grimoireSpellStatus(c,manual).engineReady,false);
});

test('favorites and inert GM notes survive export and reconciliation; comparison does not alter mechanics',()=>{
  const {e,g,c,spell}=world(),sp=spell('Magic Missile'),mechanics=JSON.stringify(sp.mechanics),actor=JSON.stringify(c);
  g.grimoireFavorite(sp.id);g.grimoireNote(sp.id,'<img src=x onerror=alert(1)> Решение мастера');g.grimoireCompare(sp.id);
  assert.match(g.grimoireComparisonHTML(c),/Волшебная стрела/);assert.equal(JSON.stringify(c),actor);assert.equal(JSON.stringify(sp.mechanics),mechanics);
  g.rules.reconcile(e.state().spells);assert.equal(sp.grimoire.gmFavorite,true);assert.match(e.dndWorldExportPayload().spells.find(row=>row.id===sp.id).grimoire.gmNote,/Решение мастера/);
  g.renderSpellsDB();
});

test('an open cast prevents learning a spell until it is cancelled',()=>{
  const {e,a,g,c,spell}=world();c.spellbook=[{spellId:spell('Magic Missile').id,access:'spellbook',prep:true}];g.desk.actorId=c.id;
  g.grimoireOpenCast(spell('Magic Missile').id);const before=JSON.stringify(c);a.addSpellFromDB(spell('Burning Hands').id);assert.equal(JSON.stringify(c),before);
  e.closeCastModal();a.addSpellFromDB(spell('Burning Hands').id);assert.ok(c.spellbook.some(row=>row.spellId===spell('Burning Hands').id));
});

test('all caster guides use actual class progression for levels 1–20, including half and third casters',()=>{
  const {a,g,c}=world();
  for(const cls of ['Волшебник','Жрец','Друид','Бард','Чародей','Колдун','Паладин','Следопыт','Воин','Плут'])for(let level=1;level<=20;level++){
    Object.assign(c,{cls,level,subcls:cls==='Воин'?'Мистический рыцарь':cls==='Плут'?'Мистический ловкач':''});a.applyClassSlots(c);
    const html=g.casterGuideHTML(c);assert.doesNotMatch(html,/NaN|undefined/);if(a.casterMeta(c))assert.ok(html.includes('до '+a.maxCircleFor(c)+' круга'));
  }
});

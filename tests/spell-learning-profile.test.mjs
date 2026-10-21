import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=v=>JSON.parse(JSON.stringify(v));
function world(extra={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,l=e.learningApi;
  const c=Object.assign(e.buildBlank(),{cls:'Волшебник',level:3,subcls:'',ab:{str:10,dex:10,con:10,int:16,wis:16,cha:16}},extra);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();l.quiet();a.characterAdopt(c);a.applyClassSlots(c);a.upgradeSpellcastingState(c);e.guardRandom();
  const spell=name=>e.state().spells.find(sp=>e.grimoireApi.grimoireActive(sp)&&e.grimoireApi.rules.identity(sp)===e.grimoireApi.rules.normalize(name));
  return {e,a,l,c,spell};
}

test('class-derived profiles and gated choices cover all standard classes at every level 1–20',()=>{
  const {e,a,l}=world();
  const classes=[['Волшебник','book','full','int'],['Жрец','prepared','full','wis'],['Друид','prepared','full','wis'],['Бард','known','full','cha'],['Чародей','known','full','cha'],['Колдун','known','pact','cha'],['Паладин','prepared','half','cha'],['Следопыт','known','half','wis'],['Воин','none','none',''],['Плут','none','none',''],['Варвар','none','none',''],['Монах','none','none','']];
  for(const [cls,mode,kind,ability] of classes)for(let level=1;level<=20;level++){
    const c=Object.assign(e.buildBlank(),{cls,level,subcls:'',spellbook:[],ab:{str:10,dex:10,con:10,int:16,wis:16,cha:16}});
    e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.applyClassSlots(c);a.upgradeSpellcastingState(c);
    const p=l.profile(c),label=cls+' '+level;
    assert.equal(p.mode,mode,label);assert.equal(p.kind,kind,label);if(ability)assert.equal(p.ability,ability,label);
    assert.equal(p.maxCircle,kind==='none'?0:kind==='half'?(level<2?0:Math.ceil(level/4)):kind==='pact'?Math.min(5,Math.ceil(level/2)):Math.min(9,Math.ceil(level/2)),label);
    assert.equal(p.prepareMax,['book','prepared'].includes(mode)&&p.maxCircle?Math.max(1,(kind==='half'?Math.floor(level/2):level)+3):0,label);
    if(mode==='book')assert.equal(p.bookChoices,6+2*(level-1),label);
    if(kind==='half')assert.equal(p.cantripMax,0,label);
    if(mode==='known')assert.ok(p.knownMax>=0,label);
    const unavailable={id:'profile-too-high',n:'Too high',l:Math.min(9,p.maxCircle+1),c:a.casterMeta(c)?.abbr||'Влш',custom:true};
    if(p.maxCircle<9)assert.equal(a.spellAddCheck(c,unavailable).ok,false,label+' cannot learn above its circle');
  }
});

test('third-caster subclasses derive their own learning progression, schools and cantrip quota',()=>{
  const {e,a,l}=world();
  for(const [cls,subcls] of [['Воин','Мистический рыцарь'],['Плут','Мистический ловкач']])for(let level=3;level<=20;level++){
    const c=Object.assign(e.buildBlank(),{cls,subcls,level});e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.applyClassSlots(c);a.upgradeSpellcastingState(c);
    const p=l.profile(c);assert.equal(p.mode,'known');assert.equal(p.kind,'third');assert.equal(p.knownMax,a.rules.thirdKnown[level-1]);assert.equal(p.maxCircle,a.rules.thirdSlots[level].length);
    assert.equal(p.cantripMax,(cls==='Плут'?3:2)+(level>=10?1:0));
  }
});

test('explicit custom class progression stays authoritative instead of borrowing a standard known table',()=>{
  const {e,a,l,c}=world();
  const template=plain(e.state().classes.find(x=>x.n==='Бард'));template.id='custom-learning-class';template.n='Хранитель звёзд';template.mechanics.origin='explicit';
  Object.assign(template.mechanics.spellcasting,{knownSpellsByLevel:Array(20).fill(7),cantripsByLevel:Array(20).fill(1),ability:'wis',preparation:'known',listAccess:'known'});
  e.state().classes.push(template);c.cls=template.n;c.spellbook=[];
  assert.equal(l.profile(c).knownMax,7);assert.equal(l.profile(c).cantripMax,1);assert.equal(l.profile(c).ability,'wis');assert.equal(l.profile(c).mode,'known');
});

test('wizard level choices respect historical circles, survive deletion and leave copying independent',async()=>{
  const {e,a,l,c,spell}=world({level:1}),candidates=e.state().spells.filter(sp=>a.spellAddCheck(c,sp).ok&&sp.l===1).slice(0,7);
  assert.equal(candidates.length,7);
  for(const sp of candidates.slice(0,6))assert.equal((await l.select(c.id,sp.id)).success,true);
  assert.equal(l.profile(c).bookChoices,0);assert.equal(l.plan(c.id,candidates[6].id).ok,false);
  a.delBookSpell(candidates[0].id);assert.equal(l.profile(c).bookChoices,0,'erasing a book entry never refunds development choices');
  a.setLevel(3);assert.equal(l.profile(c).bookChoices,4);
  const second=e.state().spells.filter(sp=>a.spellAddCheck(c,sp).ok&&sp.l===2).slice(0,3);
  for(const sp of second.slice(0,2))assert.equal((await l.select(c.id,sp.id)).success,true);
  assert.equal(l.plan(c.id,second[2].id).ok,false,'level 2 choices are restricted to first-circle spells');
  assert.equal(l.profile(c).bookChoices,2);
  const scrollId='it_scroll_mage_armor',mageArmor=spell('Mage Armor');c.spellbook=c.spellbook.filter(row=>row.spellId!==mageArmor.id);c.coins={zm:100};c.inventory.push({id:'profile-scroll',itemId:scrollId,qty:1});
  const before=l.profile(c).bookChoices,copy=l.scrollCopyPlan(c,'profile-scroll');assert.equal(copy.ok,true);assert.equal(l.commitScrollCopy(copy,20,[]).success,true);
  assert.equal(l.profile(c).bookChoices,before);assert.ok(c.spellbook.find(row=>row.spellId===copy.spellId)?.bookCopy);
});

test('legacy wizard books are preserved and their allocated choices remain spent after reload',async()=>{
  const {e,a,l,c,spell}=world({level:1});c.spellbook=['Magic Missile','Burning Hands','Shield','Detect Magic','Mage Armor','Sleep'].map(name=>({spellId:spell(name).id,prep:false}));delete c.spellLearning;delete c.spellPrepVersion;
  a.upgradeSpellcastingState(c);const ids=c.spellbook.map(x=>x.spellId);assert.equal(l.profile(c).bookChoices,0);assert.deepEqual(c.spellbook.map(x=>x.spellId),ids);
  assert.equal(await e.saveWorldNow(),true);await e.loadAll();const saved=e.state().chars.find(x=>x.id===c.id);assert.deepEqual(plain(saved.spellbook.map(x=>x.spellId)),plain(ids));assert.equal(l.profile(saved).bookChoices,0);
});

test('class round trips restore books, known choices and preparation without losing notes or granting extra replacements',()=>{
  for(const cls of ['Волшебник','Бард','Жрец']){
    const {a,l,c,spell}=world({cls,level:3});
    if(cls!=='Жрец')a.addSpellFromDB(spell(cls==='Бард'?'Healing Word':'Magic Missile').id);
    const selected=c.spellbook.find(row=>row.spellId===spell(cls==='Бард'?'Healing Word':cls==='Жрец'?'Bless':'Magic Missile').id);selected.notes='Личная пометка';selected.prep=true;
    const before=plain(selected),learning=plain(c.spellLearning);a.setClass('Воин');assert.ok(c.spellbook.some(e=>e.spellId===selected.spellId));assert.equal(a.spellEntryReady(c,c.spellbook.find(e=>e.spellId===selected.spellId),spell(cls==='Бард'?'Healing Word':cls==='Жрец'?'Bless':'Magic Missile')),false);
    a.setClass(cls);assert.deepEqual(plain(c.spellbook.find(e=>e.spellId===selected.spellId)),before);assert.equal(c.spellLearning.replacements,learning.replacements);
    assert.equal(l.profile(c).mode,cls==='Волшебник'?'book':cls==='Жрец'?'prepared':'known');
  }
});

test('lowering and regaining a known-caster level cannot farm replacement credits',()=>{
  const {a,c}=world({cls:'Бард',level:2});a.setLevel(3);assert.equal(c.spellLearning.replacements,1);a.setLevel(2);assert.equal(c.spellLearning.replacements,0);a.setLevel(3);assert.equal(c.spellLearning.replacements,0);a.setLevel(4);assert.equal(c.spellLearning.replacements,1);
});
test('an archived shared spell can be learned by a new class without overwriting the old class record',async()=>{
  const {a,l,c,spell}=world(),sp=spell('Thunderwave');a.addSpellFromDB(sp.id);c.spellbook[0].notes='Запись волшебника';const wizardEntry=plain(c.spellbook[0]);
  a.setClass('Бард');assert.equal(a.spellEntryReady(c,c.spellbook.find(e=>e.spellId===sp.id),sp),false);assert.equal(l.plan(c.id,sp.id).ok,true);
  assert.equal((await l.select(c.id,sp.id)).success,true);assert.equal(a.knownSpellCount(c),1);assert.equal(a.spellEntryReady(c,c.spellbook.find(e=>e.spellId===sp.id),sp),true);
  assert.equal(c.spellbook.filter(e=>e.spellId===sp.id).length,1);a.setClass('Волшебник');assert.deepEqual(plain(c.spellbook.find(e=>e.spellId===sp.id)),wizardEntry);
  a.setClass('Бард');assert.equal(a.knownSpellCount(c),1);assert.equal(a.spellEntryReady(c,c.spellbook.find(e=>e.spellId===sp.id),sp),true);
});

test('learning is durably saved once, and failure restores the old known spell and replacement choice',async()=>{
  const {e,a,l,c,spell}=world({cls:'Чародей',level:3});a.addSpellFromDB(spell('Magic Missile').id);c.spellLearning.replacements=1;a.beginKnownSpellReplacement(c,spell('Magic Missile').id);
  const before=plain(c),plan=l.plan(c.id,spell('Burning Hands').id),restore=l.persistence(async()=>false);
  assert.equal((await l.commit(plan)).success,false);restore();assert.deepEqual(plain(c),before);
  assert.equal((await l.commit(plan)).success,true);assert.equal(c.spellLearning.replacements,0);assert.equal(c.spellbook.some(e=>e.spellId===spell('Magic Missile').id),false);
  assert.equal((await l.commit(plan)).success,false,'replaying the old choice cannot spend twice');
  const saved=await l.saved();assert.ok(saved.ok);assert.ok(saved.envelope.state.chars.find(x=>x.id===c.id).spellbook.some(x=>x.spellId===spell('Burning Hands').id));
});
test('archived bard Magical Secrets cannot grant another class foreign spell access',()=>{
  const {a,c,spell}=world({cls:'Бард',level:9}),sp=spell('Fireball');a.setLevel(10);a.addSpellFromDB(sp.id);const secret=c.spellbook.find(e=>e.spellId===sp.id);assert.equal(secret.anyClassKnown,true);
  a.setClass('Колдун');const archived=c.spellbook.find(e=>e.spellId===sp.id);assert.equal(archived.access,'archive');assert.equal(a.spellEntryReady(c,archived,sp),false);assert.equal(a.knownSpellCount(c),0);assert.equal(a.slotPlanFor(c,sp).ok,false);
  a.setClass('Бард');assert.equal(a.spellEntryReady(c,c.spellbook.find(e=>e.spellId===sp.id),sp),true);assert.equal(c.spellLearning.anyClassChoices,1);
});

test('creating a high-level bard grants earned Magical Secrets once and persists their consumption',async()=>{
  const {e,a,l,spell}=world();
  for(const [level,earned] of [[10,2],[14,4],[18,6]]){
    const draft=Object.assign(e.buildBlank(),{name:'Новый бард '+level,cls:'Бард',subcls:'Коллегия Доблести',bg:'Солдат',level,baseAbilities:{str:15,dex:14,con:13,int:12,wis:10,cha:8},abilityMethod:'array',hpMethod:'average',hpRolls:[],buildChoices:{classSkills:['Акробатика','Внимательность','Убеждение'],tools:[],languages:['Эльфийский']}});
    const used=new Set();draft.buildChoices.tools=a.characterTraining(draft).toolChoices.map(choices=>{const value=choices.find(v=>!used.has(v));used.add(value);return value;});
    assert.deepEqual(plain(a.characterCreatorErrors(draft)),[]);a.setDraft(draft);assert.equal(a.characterCreatorCommit(),true);
    const c=e.state().chars.find(row=>row.id===draft.id);assert.equal(c.spellLearning.anyClassChoices,earned);
    assert.equal(l.plan(c.id,spell('Fireball').id).ok,true);assert.equal((await l.select(c.id,spell('Fireball').id)).success,true);
    assert.equal(c.spellLearning.anyClassChoices,earned-1);a.upgradeSpellcastingState(c);assert.equal(c.spellLearning.anyClassChoices,earned-1);
    await e.loadAll();const loaded=e.state().chars.find(row=>row.id===c.id);assert.equal(loaded.spellLearning.anyClassChoices,earned-1);a.upgradeSpellcastingState(loaded);assert.equal(loaded.spellLearning.anyClassChoices,earned-1);
    assert.equal(a.spellEntryReady(loaded,loaded.spellbook.find(row=>row.spellId===spell('Fireball').id),spell('Fireball')),true);
  }
});

test('stale class, level, replacement and spell definitions reject without changing the world',async()=>{
  for(const mutate of [(c)=>c.level=1,(c)=>c.cls='Воин',(c)=>c.spellLearning.replacements=2,(_c,sp)=>sp.l=9]){
    const {l,c,spell}=world(),sp=spell('Misty Step'),plan=l.plan(c.id,sp.id);assert.equal(plan.ok,true);mutate(c,sp);const before=plain(c);assert.equal((await l.commit(plan)).success,false);assert.deepEqual(plain(c),before);
  }
});

test('preparation selection is durable, rolls back on failure, and only rest changes active access',async()=>{
  const {e,a,l,c,spell}=world({cls:'Жрец',level:3}),sp=spell('Guiding Bolt'),entry=c.spellbook.find(x=>x.spellId===sp.id);for(const row of c.spellbook)row.prep=false;delete c.spellPrepDraft;
  const plan=l.plan(c.id,sp.id,'prepare'),before=plain(c),restore=l.persistence(async()=>false);assert.equal((await l.commit(plan)).success,false);restore();assert.deepEqual(plain(c),before);
  assert.equal((await l.commit(plan)).success,true);assert.equal(a.spellEntryReady(c,entry,sp),false);assert.ok(c.spellPrepDraft.choices.includes(sp.id));
  await e.loadAll();const loaded=e.state().chars.find(x=>x.id===c.id);assert.ok(loaded.spellPrepDraft.choices.includes(sp.id));assert.equal(a.longRest(),true);assert.equal(a.spellEntryReady(loaded,loaded.spellbook.find(x=>x.spellId===sp.id),sp),true);
});

test('always-prepared subclass spells, rituals and off-class limits keep their distinct rules',()=>{
  const cleric=world({cls:'Жрец',subcls:'Домен Жизни',level:3}),bless=cleric.spell('Bless'),grant=cleric.c.spellbook.find(e=>e.spellId===bless.id);
  assert.equal(cleric.a.spellEntryReady(cleric.c,grant,bless),true);assert.equal(cleric.l.plan(cleric.c.id,bless.id,'prepare').ok,false);assert.equal(cleric.l.plan(cleric.c.id,cleric.spell('Magic Missile').id).ok,false);
  const {a,l,c,spell}=world(),ritual=spell('Detect Magic');a.addSpellFromDB(ritual.id);const entry=c.spellbook.find(e=>e.spellId===ritual.id);assert.equal(a.spellEntryReady(c,entry,ritual),false);assert.equal(a.spellRitualAllowed(c,ritual,entry),true);assert.equal(l.plan(c.id,spell('Cure Wounds').id).ok,false);
});

test('MP and legacy free settings preserve the automatic class model, pact payment and existing learning',async()=>{
  const {e,a,l,c,spell}=world({cls:'Колдун',level:5});a.addSpellFromDB(spell('Hellish Rebuke').id);const book=plain(c.spellbook);
  const switched=await a.magicSwitch('mp','free');assert.equal(switched.success,true);assert.equal(a.magicFreeAccess(),false);assert.equal(e.state().campaignMagic.preparation,'class');assert.equal(l.profile(c).mode,'known');assert.equal(l.profile(c).recovery,'short');
  assert.deepEqual(plain(c.spellbook),book);assert.equal(a.slotPlanFor(c,spell('Hellish Rebuke'),3).ok,true);assert.equal(a.slotPlanFor(c,spell('Darkness'),2).ok,false);assert.equal(a.magicRules.settings({version:1,mode:'mp',preparation:'known',revision:4}).preparation,'class');
  await a.magicSwitch('slots');assert.equal(c.slots[3].max,2);assert.deepEqual(plain(c.spellbook),book);
});

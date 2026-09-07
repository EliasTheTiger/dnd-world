import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=v=>JSON.parse(JSON.stringify(v));
function world(overrides={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),overrides);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();e.guardRandom();
  return {e,a,c};
}
function draft(a,overrides={}){
  return {name:'Эйра',player:'Игрок',race:'Человек',subrace:'',cls:'Воин',subcls:'',bg:'Солдат',level:1,align:'Истинно нейтральный',
    ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10},baseAbilities:{str:15,dex:14,con:13,int:12,wis:10,cha:8},abilityMethod:'array',hpMethod:'average',hpRolls:[],
    buildChoices:{classSkills:['Акробатика','Внимательность'],tools:['Игральные кости'],languages:['Эльфийский']},...overrides};
}
test('24 backgrounds are distinct, sourced and expose real training, including the missing charlatan',()=>{
  const {a}=world();assert.equal(a.backgrounds.length,24);assert.equal(new Set(a.backgrounds.map(b=>b.n)).size,24);
  for(const b of a.backgrounds){assert.ok(b.source);assert.ok(b.f);assert.equal(b.skills.length+(b.skillChoices||0),2,b.n);}
  assert.deepEqual(plain(a.backgrounds.find(b=>b.n==='Шарлатан').skills),['Обман','Ловкость рук']);
  assert.deepEqual(plain(a.backgrounds.find(b=>b.n==='Следователь').skills),['Анализ','Проницательность']);
});
test('every class has its own dropdown and the 2014 subclass level',()=>{
  const {e,a}=world();const levels={Варвар:3,Бард:3,Воин:3,Волшебник:2,Друид:2,Жрец:1,Колдун:1,Монах:3,Паладин:3,Плут:3,Следопыт:3,Чародей:1};
  for(const cls of e.catalogs.classes){assert.equal(a.rules.subclassLevel(cls),levels[cls.n]);assert.ok(a.rules.subclassOptions(cls).length);}
  assert.ok(a.rules.subclassOptions(e.catalogs.classes.find(c=>c.n==='Воин')).includes('Боевой мастер'));
});
test('branches tolerate missing arrays and escape imported names; invalid old selection stays visible',()=>{
  const {a}=world();assert.deepEqual(plain(a.rules.branchOptions({})),[]);
  assert.deepEqual(plain(a.rules.branchOptions({subs:[null,{n:'Ветвь'},{n:'Ветвь'},{}]})),['Ветвь']);
  assert.match(a.subraceOpts('Человек','Чужая ветвь'),/selected disabled/);
  assert.doesNotMatch(a.subraceOpts('Человек','<script>'),/<script>/);
});
test('a dwarf may not select an elven branch and failed validation changes nothing',()=>{
  const {a,c}=world({race:'Дварф'});const before=JSON.stringify(c);
  assert.equal(a.characterSelectValue('subrace','Лесной эльф'),false);assert.equal(JSON.stringify(c),before);
});
test('wood elf selection updates wisdom and movement once; switching back reverses it',()=>{
  const {a,c}=world({race:'Эльф'});a.characterAdopt(c);
  a.characterSelectValue('subrace','Лесной эльф');assert.equal(c.ab.wis,11);assert.equal(a.speedTotal(c),'10,5 м');
  a.characterSelectValue('subrace','Лесной эльф');a.characterSync(c);assert.equal(c.ab.wis,11);
  a.characterSelectValue('subrace','Высший эльф');assert.equal(c.ab.wis,10);assert.equal(c.ab.int,11);assert.equal(a.speedTotal(c),'9 м');
});
test('hill dwarf HP and CON changes propagate without free healing or repeated bonuses',()=>{
  const {a,c}=world({race:'Дварф',level:4,hp:7,hpMax:30});a.characterAdopt(c);
  a.characterSelectValue('subrace','Холмовой дварф');assert.equal(c.hpMax,34);assert.equal(c.hp,7);
  a.abDelta('con',2);assert.equal(c.hpMax,38);a.characterSync(c);assert.equal(c.hpMax,38);
  a.characterSelectValue('subrace','Горный дварф');assert.equal(c.hpMax,34);assert.equal(c.ab.str,12);
});
test('new mountain dwarf wizard has armor training and poison resistance in the combat engine',()=>{
  const {a,c}=world({race:'Дварф',subrace:'Горный дварф',cls:'Волшебник'});a.characterAdopt(c);
  assert.equal(a.armorProfsOf(c).medium,true);assert.equal(a.armorProfsOf(c).heavy,false);
  assert.equal(a.dmgAfterTraits(c,11,'яд',{}).amount,5);
  a.setRace('Эльф');assert.equal(a.dmgAfterTraits(c,11,'яд',{}).amount,11);assert.equal(a.armorProfsOf(c).medium,false);
});
test('dragon ancestry determines damage resistance and never masquerades as a subrace',()=>{
  const {a,c}=world({race:'Драконорожденный'});a.characterAdopt(c);
  a.characterSelectValue('ancestry','Красный');assert.equal(c.subrace,'');assert.equal(a.dmgAfterTraits(c,9,'огонь',{}).amount,4);
  a.characterSelectValue('ancestry','Серебряный');assert.equal(a.dmgAfterTraits(c,9,'огонь',{}).amount,9);assert.equal(a.dmgAfterTraits(c,9,'холод',{}).amount,4);
});
test('background change removes its ordinary skill grants but preserves expertise and manual modifiers',()=>{
  const {a,c}=world({bg:'Солдат'});c.skills.Атлетика={p:1,m:null};c.skills.Запугивание={p:2,m:8};a.characterAdopt(c);
  a.characterSelectValue('bg','Шарлатан');assert.equal(c.skills.Атлетика.p,0);assert.equal(c.skills.Запугивание.p,2);assert.equal(c.skills.Запугивание.m,8);
  assert.equal(c.skills.Обман.p,1);assert.equal(a.skillBonus(c,9).manual,false);
});
test('class switch clears an incompatible subclass, saving throws and stale spellcasting ability',()=>{
  const {a,c}=world({cls:'Жрец',subcls:'Домен Жизни',spellAb:'wis',level:3});a.characterAdopt(c);
  a.setClass('Волшебник');assert.equal(c.subcls,'');assert.equal(c.spellAb,'');assert.equal(c.saves.cha,false);assert.equal(c.saves.int,true);assert.equal(c.hitDice,'3d6');
  assert.equal(a.characterSelectValue('subcls','Домен Жизни'),false);
});
test('subclasses are gated by level and loss of third-caster subclass removes spell slots',()=>{
  const {a,c}=world({cls:'Воин',level:2});assert.equal(a.characterSelectValue('subcls','Чемпион'),false);
  a.setLevel(3);assert.equal(a.characterSelectValue('subcls','Мистический рыцарь'),true);assert.equal(c.slots[1].max,2);
  a.setLevel(2);assert.equal(c.subcls,'');assert.deepEqual(plain(c.slots),{});
});
test('both third-caster subclasses have correct level 3, 7, 13 and 19 slots and INT casting',()=>{
  const {a}=world();for(const [cls,subcls] of [['Воин','Мистический рыцарь'],['Плут','Мистический ловкач']]){
    for(const [level,slots] of [[3,[2]],[7,[4,2]],[13,[4,3,2]],[19,[4,3,3,1]]]){const c={cls,subcls,level};assert.deepEqual(plain(a.slotsRowFor(c)),slots);assert.equal(a.casterMeta(c).ability,'int');assert.equal(a.maxCircleFor(c),slots.length);}
    assert.equal(a.knownSpellMax({cls,subcls,level:3}),3);assert.equal(a.cantripKnownMax({cls,subcls,level:3}),cls==='Плут'?3:2);
  }
});
test('standard array and point-buy reject illegal arrays, overspending and fractional levels',()=>{
  const {a}=world();const d=draft(a);assert.deepEqual(plain(a.characterCreatorErrors(d)),[]);
  d.baseAbilities.str=14;assert.ok(a.characterCreatorErrors(d).some(s=>s.includes('Стандартный')||s.includes('стандартный')));
  d.abilityMethod='points';d.baseAbilities={str:15,dex:15,con:15,int:15,wis:15,cha:15};assert.ok(a.characterCreatorErrors(d).some(s=>s.includes('27')));
  d.level=1.5;assert.ok(a.characterCreatorErrors(d).some(s=>s.includes('целым')));
});
test('creator uses first hit die maximum, final CON, hill dwarf HP and per-level minimum of one',()=>{
  const {a}=world();const d=draft(a,{race:'Дварф',subrace:'Холмовой дварф',cls:'Жрец',subcls:'Домен Жизни',level:3});
  const p=a.characterCreationPreview(d);assert.equal(p.ab.con,15);assert.equal(p.hpMax,27);
  const low=draft(a,{cls:'Волшебник',race:'Эльф',subrace:'Высший эльф',level:3,hpMethod:'manual',hpRolls:[1,1],baseAbilities:{str:10,dex:10,con:3,int:15,wis:10,cha:10}});
  assert.equal(a.characterCreationPreview(low).hpMax,4);
});
test('variant human replaces six bonuses, requires distinct choices, and Tough scales with level',()=>{
  const {a}=world();const d=draft(a,{subrace:'Вариант человека',level:3,subcls:'Чемпион'});
  d.buildChoices={...d.buildChoices,abilities:['str','con'],raceSkills:['История'],feat:'Крепкий'};
  assert.deepEqual(plain(a.rules.origin(d,{n:'Человек'}).ab),{str:1,con:1});assert.equal(a.characterCreationPreview(d).hpMax,34);
  d.buildChoices.abilities=['str','str'];assert.ok(a.characterCreatorErrors(d).some(s=>s.includes('разные характеристики')));
});
test('shared race/background proficiency gives a replacement choice instead of losing a skill',()=>{
  const {a}=world();const d=draft(a,{race:'Эльф',subrace:'Лесной эльф',bg:'Моряк'});
  const t=a.characterTraining(d);assert.equal(t.groups.find(g=>g.key==='duplicateSkills').count,1);
});
test('creation validation and cancellation do not add a character; valid creation commits exactly once',()=>{
  const {e,a}=world();const c=Object.assign(e.buildBlank(),draft(a));const before=e.state().chars.length;
  c.name='';a.setDraft(c);assert.equal(a.characterCreatorCommit(),false);assert.equal(e.state().chars.length,before);
  c.name='Эйра';assert.equal(a.characterCreatorCommit(),true);assert.equal(e.state().chars.length,before+1);
  assert.equal(a.characterCreatorCommit(),false);assert.equal(e.state().chars.length,before+1);
  const created=e.state().chars.at(-1);assert.equal(created.saves.str,true);assert.equal(created.skills.Внимательность.p,1);assert.equal(created.hpMax,12);assert.ok(created.characterBuild);
});
test('reloading a saved character does not double racial bonuses or heal wounds',()=>{
  const {a,c}=world({race:'Эльф'});a.characterAdopt(c);a.characterSelectValue('subrace','Лесной эльф');c.hp=3;
  const restored=plain(c),before=JSON.stringify(restored);a.characterAdopt(restored);a.characterSync(restored);
  assert.equal(restored.ab.wis,11);assert.equal(restored.hp,3);assert.equal(JSON.stringify(restored),before);
});
test('gnome magic advantage is conditional and fey ancestry blocks magical sleep only',()=>{
  const {a,c}=world({race:'Гном'});a.characterAdopt(c);const ti={kind:'ally',obj:c};
  assert.equal(a.saveConditionMode(ti,'int',{magic:true}).adv,true);assert.equal(a.saveConditionMode(ti,'int',{magic:false}).adv,false);assert.equal(a.saveConditionMode(ti,'con',{magic:true}).adv,false);
  a.setRace('Эльф');assert.equal(a.holderEffectImmune(c,'magicalSleep'),true);assert.equal(a.holderEffectImmune(c,'poison'),false);
});
test('unarmored defense is reflected in actual armor class',()=>{
  const {e,a,c}=world({cls:'Варвар',ab:{str:12,dex:14,con:16,int:10,wis:12,cha:10}});a.characterAdopt(c);assert.equal(e.acTotal(c),15);
  a.setClass('Монах');assert.equal(e.acTotal(c),13);
});
test('the sheet removes the exact-tag editor and uses a select for the subclass',()=>{
  const {a,c}=world();const html=a.sheetHTML(c);assert.doesNotMatch(html,/Точный тег|bg3GithyankiEvidenceSet|Универсалист…/);
  assert.match(html,/<select id="sheet-subclass"/);assert.match(html,/У этого народа нет ветвей|Обычный человек/);
  assert.match(html,/onchange="setHp\(this.value\)"/);assert.match(html,/Базовая скорость/);
});
test('editing current HP uses downing, group concentration removal and waking without spending temporary HP',()=>{
  const {e,a,c}=world({hp:10,hpTemp:5});const ally=Object.assign(e.buildBlank(),{id:'other'});
  for(const target of [c,ally])target.activeFx=[{uid:'fx-'+target.id,k:'spell',id:'test-spell',label:'Общее заклинание',casterId:c.id,conc:true,castId:'shared-cast',fx:[]}];
  e.setState({...e.catalogs,chars:[c,ally],activeCharId:c.id});a.setHp('0');
  assert.equal(c.hp,0);assert.equal(c.hpTemp,5);assert.ok(c.cond.includes('Бессознательный'));assert.equal(ally.activeFx.length,0);assert.equal(c.activeFx.length,0);
  a.setHp('4');assert.equal(c.hp,4);assert.ok(!c.cond.includes('Бессознательный'));
});
test('spent spell slots survive losing and regaining the subclass, then recover on rest',()=>{
  const {a,c}=world({cls:'Воин',level:3});a.characterSelectValue('subcls','Мистический рыцарь');c.slots[1].cur=0;
  a.characterSelectValue('subcls','Чемпион');assert.deepEqual(plain(c.slots),{});a.characterSelectValue('subcls','Мистический рыцарь');assert.equal(c.slots[1].cur,0);
  a.longRest();a.characterSelectValue('subcls','Чемпион');a.characterSelectValue('subcls','Мистический рыцарь');assert.equal(c.slots[1].cur,2);
});
test('long rest rounds hit dice down and cannot resurrect a character with no HP',()=>{
  const {a,c}=world({level:3,hdUsed:3});a.characterAdopt(c);assert.equal(a.longRest(),true);assert.equal(c.hdUsed,2);
  c.hp=0;c.deaths={s:0,f:3};const before=JSON.stringify(c);assert.equal(a.longRest(),false);assert.equal(JSON.stringify(c),before);
});
test('Eldritch Knight school restrictions apply to learning and permit one unrestricted spell at level 3',()=>{
  const {a,c,e}=world({cls:'Воин',subcls:'Мистический рыцарь',level:3});
  const spells=[{id:'ill1',n:'Иллюзия',l:1,s:'Иллюзии',c:'Влш'},{id:'ill2',n:'Иллюзия 2',l:1,s:'Иллюзии',c:'Влш'},{id:'ward',n:'Защита',l:1,s:'Ограждение',c:'Влш'}];
  e.setState({...e.catalogs,chars:[c],spells,activeCharId:c.id});assert.equal(a.spellAddCheck(c,spells[0]).ok,true);
  c.spellbook=[{spellId:'ill1',access:'known'}];assert.equal(a.spellAddCheck(c,spells[1]).ok,false);assert.equal(a.spellAddCheck(c,spells[2]).ok,true);
});
test('Champion changes only weapon critical range at the correct subclass levels',()=>{
  const {a,c}=world({cls:'Воин',subcls:'Чемпион',level:3});a.characterAdopt(c);
  assert.equal(a.finalizeRollSpec({rows:[],meta:{kind:'weapon',caster:c}}).meta.criticalThreshold,19);
  assert.equal(a.finalizeRollSpec({rows:[],meta:{kind:'spell',caster:c}}).meta.criticalThreshold,20);
  c.level=15;assert.equal(a.finalizeRollSpec({rows:[],meta:{kind:'weapon',caster:c}}).meta.criticalThreshold,18);
});
test('ancestry advantages use the combat engine charm and fear contexts without unconditional bonuses',()=>{
  const {a,c}=world({race:'Эльф'});a.characterAdopt(c);
  assert.ok(a.rollFxEntries(c,'save.wis',['charm']).some(f=>f.mode==='adv'));assert.ok(!a.rollFxEntries(c,'save.wis',[]).some(f=>f.mode==='adv'));
  a.setRace('Полурослик');assert.ok(a.rollFxEntries(c,'save.wis',['fear']).some(f=>f.mode==='adv'));assert.ok(!a.rollFxEntries(c,'save.wis',['charm']).some(f=>f.mode==='adv'));
});
test('choosing a language instead of a merchant tool does not grant both; explicit tool aliases work',()=>{
  const {a,c}=world({bg:'Гильдейский торговец',buildChoices:{tools:['Дополнительный язык'],languages:['Эльфийский','Гномий','Орочий']}});a.characterAdopt(c);
  assert.equal(a.toolProficiencyHas(c,{prof:'инструменты навигатора'}),false);
  c.buildChoices.tools=['Навигационные инструменты'];a.characterSync(c);assert.equal(a.toolProficiencyHas(c,{prof:'инструменты навигатора'}),true);
  c.toolProficiencies.push('Набор для маскировки');assert.equal(a.toolProficiencyHas(c,{prof:'маскировочные инструменты'}),true);
});
test('switching from high elf to wood elf retracts the extra language',()=>{
  const {a,c}=world({race:'Эльф',subrace:'Высший эльф',buildChoices:{languages:['Драконий']},langs:'Общий, Эльфийский, Драконий'});a.characterAdopt(c);
  a.characterSelectValue('subrace','Лесной эльф');assert.equal(c.langs,'Общий, Эльфийский');
});

test('variant human feat follows training edits and is removed with its HP bonus when changing ancestry',()=>{
  const {a,e}=world(),d=Object.assign(e.buildBlank(),draft(a,{subrace:'Вариант человека'}));
  d.buildChoices={...d.buildChoices,abilities:['str','con'],raceSkills:['История'],feat:'Крепкий'};
  a.setDraft(d);assert.equal(a.characterCreatorCommit(),true);const c=e.state().chars.at(-1),hp=c.hpMax;
  assert.ok(c.feats.includes('Крепкий'));assert.equal(c.characterBuild.originFeat.name,'Крепкий');
  const edit=plain(c);edit.editingId=c.id;edit.buildChoices.feat='Борец';a.setDraft(edit);assert.equal(a.characterCreatorCommit(),true);
  assert.ok(!c.feats.includes('Крепкий'));assert.ok(c.feats.includes('Борец'));assert.equal(c.hpMax,hp-2);
  a.setRace('Полуорк');assert.ok(!c.feats.includes('Борец'));assert.ok(!c.abilities.some(e=>e.originGranted));
});

test('editing origin choices enforces feat prerequisites and excludes half-elf Charisma choices before commit',()=>{
  const {a,c,e}=world({race:'Человек',subrace:'Вариант человека',ab:{str:8,dex:10,con:10,int:10,wis:10,cha:10}});a.characterAdopt(c);
  const edit=Object.assign(plain(c),draft(a,{editingId:c.id,subrace:'Вариант человека',ab:plain(c.ab),characterBuild:plain(c.characterBuild)}));
  edit.buildChoices={...edit.buildChoices,abilities:['dex','con'],raceSkills:['История'],feat:'Борец'};
  a.setDraft(edit);const before=JSON.stringify(e.state().chars);assert.equal(a.characterCreatorCommit(),false);assert.equal(JSON.stringify(e.state().chars),before);
  assert.ok(a.characterCreatorErrors(edit).some(s=>s.includes('Сила 13')));
  edit.race='Полуэльф';edit.subrace='';edit.buildChoices.abilities=['cha','str'];assert.ok(a.characterCreatorErrors(edit).some(s=>s.includes('характеристик')));
});

test('changing an invalid legacy wizard archetype archives old school grants and does not restore them during migration',()=>{
  const {a,c}=world({id:'char_roku',cls:'Волшебник',subcls:'Универсалист',level:3,spellbook:[{spellId:'sp_evoc_allies',access:'feature',source:'Школа воплощения',granted:true,alwaysPrepared:true,prep:true}]});
  a.characterSelectValue('subcls','Школа Иллюзий');const spell=c.spellbook.find(e=>e.spellId==='sp_evoc_allies');
  assert.equal(spell.access,'archive');assert.equal(spell.prep,false);assert.equal(spell.granted,undefined);
});
test('creation matrix validates all 12 classes at levels 1–20 across every core race and all 24 backgrounds',()=>{
  const {e,a}=world(),seenRaces=new Set(),seenBackgrounds=new Set();let count=0;
  for(const [i,cls]of e.catalogs.classes.entries())for(let level=1;level<=20;level++){
    const race=e.catalogs.races[(i+level)%e.catalogs.races.length],branches=a.rules.branchOptions(race),subclasses=a.rules.subclassOptions(cls);
    const d=draft(a,{race:race.n,subrace:branches.length?branches[level%branches.length]:'',cls:cls.n,subcls:level>=a.rules.subclassLevel(cls)?subclasses[level%subclasses.length]:'',level,bg:a.backgrounds[(i+level*12)%24].n,buildChoices:{}});
    if(race.n==='Драконорожденный')d.ancestry='Красный';
    const p=a.rules.origin(d,race);d.buildChoices.abilities=a.rules.keys.filter(k=>!p.exclude.includes(k)).slice(0,p.abilityChoices);if(p.featChoices)d.buildChoices.feat='Крепкий';
    const t=a.characterTraining(d),used=new Set(t.fixed);for(const g of t.groups){const chosen=g.options.filter(s=>!used.has(s)).slice(0,g.count);d.buildChoices[g.key]=chosen;chosen.forEach(s=>used.add(s));}
    const tools=new Set();d.buildChoices.tools=t.toolChoices.map(options=>{const selected=options.find(v=>!tools.has(v));tools.add(selected);return selected;});
    d.buildChoices.languages=a.rules.languages.filter(v=>!p.languages.includes(v)).slice(0,a.characterTraining(d).languageChoices);
    assert.deepEqual(plain(a.characterCreatorErrors(d)),[],`${cls.n} ${level} / ${race.n} / ${d.bg}`);
    assert.ok(a.characterCreationPreview(d).hpMax>=level);seenRaces.add(race.n);seenBackgrounds.add(d.bg);count++;
  }
  assert.equal(count,240);assert.equal(seenRaces.size,9);assert.equal(seenBackgrounds.size,24);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
test('array migration cannot treat an element index as an explicit force-recompile request',()=>{
 const {e,g,rows}=world(),spells=rows.map(s=>JSON.stringify(s.mechanics)),abilities=e.catalogs.abilities.map(s=>JSON.stringify(s.mechanics));rows.forEach(g.upgradeSpell);e.catalogs.abilities.forEach(g.upgradeAbility);
 rows.forEach((s,i)=>assert.equal(JSON.stringify(s.mechanics),spells[i],s.id));e.catalogs.abilities.forEach((s,i)=>assert.equal(JSON.stringify(s.mechanics),abilities[i],s.id));
 for(const [records,upgrade] of [[e.catalogs.races,g.upgradeRace],[e.catalogs.classes,g.upgradeClass]]){for(const row of records){row.mechanics.origin='explicit';row.mechanics.userRule='saved-explicit-rule';}records.forEach(upgrade);assert.ok(records.every(row=>row.mechanics.userRule==='saved-explicit-rule'));}
});
function world(){const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs,chars:[]});return {e,g:e.grimoireApi,a:e.charactersApi,rows:e.state().spells};}
test('grimoire has one active 2014 card per identity; raw editions remain only as archived provenance',()=>{
 const {g,rows}=world(),report=g.rules.audit(rows);assert.equal(report.active,321);assert.deepEqual(plain(report.errors),[]);assert.equal(report.officialRussian,0);assert.equal(rows.filter(s=>g.grimoireActive(s)&&s.catalogSource).length,319);
 assert.ok(rows.some(s=>s.grimoire.status==='alias'&&s.catalogSource?.documentKey==='srd-2024'));
 assert.equal(new Set(rows.filter(g.grimoireActive).map(s=>g.rules.normalize(s.n))).size,321);
});
test('publisher PDF supplies all 319 spell headers and eight exact base class lists',()=>{
 const {rows,g}=world(),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('data/dnd5e/srd51-spell-facts.js','utf8'),ctx);const source=ctx.DND_SRD51_SPELL_FACTS;
 assert.equal(source.sha256,'2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0');assert.equal(Object.keys(source.spells).length,319);
 for(const s of rows.filter(s=>g.grimoireActive(s)&&s.catalogSource)){const f=source.spells[s.grimoire.english];assert.ok(f,s.n);assert.equal(s.l,f.level);assert.equal(s.conc,f.concentration);assert.equal(s.ritual,f.ritual);assert.deepEqual(plain(g.spellClassTokens(s)),plain(g.rules.classTokens(f.classes.join(', '))));assert.ok(f.page>=114&&f.page<=194);assert.ok(f.castingTime.length<150&&f.range.length<80&&f.components.length<600,f.name);assert.doesNotMatch(s.r+s.t+s.d,/[A-Za-z]/);}
 const revive=g.spellOf('sp_оживление');assert.equal(revive.s,'Некромантия');assert.equal(revive.r,'Касание');assert.match(revive.c,/Пал/);
 const identify=rows.find(s=>g.grimoireActive(s)&&s.grimoire.english==='Identify');assert.deepEqual(plain(g.spellClassTokens(identify)),['Брд','Влш']);
 assert.equal(g.spellRuleOf(g.spellOf('sp_оживление_мертвых')).level,3);
 for(const s of rows.filter(s=>g.grimoireActive(s)&&s.catalogSource)){const f=source.spells[s.grimoire.english];assert.equal(s.grimoire.upcastPresent,f.upcast);if(f.upcast)assert.ok(s.hi,s.n+' must explain its higher-circle benefit');}
});
test('canonical migration is idempotent and preserves old definitions and preparation without refunding resources',()=>{
 const {g,rows}=world();const alias=rows.find(s=>s.grimoire.status==='alias'&&s.open5e?.originalName==='Fireball'),canonical=g.spellOf(alias.id);
 const c={spellbook:[{spellId:alias.id,prep:true,cur:0,note:'original'},{spellId:canonical.id,prep:false,cur:1}],spellPrepDraft:{choices:[alias.id,canonical.id]},spellReplacementDraft:{removeId:alias.id},slots:{3:{cur:0,max:2}},magicResource:{spent:5,max:27}};
 g.reconcile(rows,[c]);assert.equal(c.spellbook.length,1);assert.equal(c.spellbook[0].prep,true);assert.equal(c.spellbook[0].cur,0);assert.equal(c.spellbook[0].note,'original');assert.deepEqual(plain(c.spellPrepDraft.choices),[canonical.id]);assert.equal(c.spellReplacementDraft.removeId,canonical.id);assert.equal(c.slots[3].cur,0);assert.equal(c.magicResource.spent,5);assert.equal(c.grimoireMigration.duplicates.length,1);
 const before=JSON.stringify([rows,c]);g.reconcile(rows,[c]);assert.equal(JSON.stringify([rows,c]),before);assert.ok(canonical.grimoire.legacyDefinition);
});
test('a catalog revision preserves the GM edited card and its explicit mechanics while upgrading untouched cards',()=>{
 const {g,rows}=world(),custom=g.spellOf('sp_щит'),untouched=g.spellOf('sp_magic_sleep');custom.grimoire.translation='custom';custom.grimoire.revision='older';custom.grimoire.engineRevision='older';custom.n='Мой защитный барьер';custom.x='Правило нашей кампании';custom.mechanics.effects=[{stat:'ac',mode:'add',value:7}];const saved=JSON.stringify(custom.mechanics);
 untouched.grimoire.revision='older';untouched.grimoire.engineRevision='older';untouched.mechanics.resolution.rolls[0].cnt=1;
 g.reconcile(rows,[]);assert.equal(custom.n,'Мой защитный барьер');assert.equal(custom.x,'Правило нашей кампании');assert.equal(JSON.stringify(custom.mechanics),saved);assert.equal(custom.grimoire.translation,'custom');assert.equal(custom.grimoire.revision,g.rules.revision);assert.equal(untouched.mechanics.resolution.rolls[0].cnt,5);
});

test('a live archived spell and its canonical card share a stacking identity without changing either cast snapshot',()=>{
 const {e,g,rows}=world(),sp=g.spellOf('sp_щит'),alias=rows.find(row=>row.grimoire?.canonicalId===sp.id),c=Object.assign(e.buildBlank(),{id:'protected'}),foe={id:'protected-foe',n:'Protected foe',hp:20,hpMax:20,ac:10,activeFx:[]};e.state().chars.push(c);e.state().foes.push(foe);const base=e.acTotal(c),entry=(id,castId,power)=>({id,k:'spell',uid:castId,castId,stackKey:'spell:'+id,power,appliedRound:1,mechanicsVersion:1,effectSchemaVersion:1,breakOn:[],fx:[{stat:'ac',mode:'add',value:5}]});
 c.activeFx=[entry(alias.id,'old-cast',1),entry(sp.id,'new-cast',2)];delete c.__fxC;foe.activeFx=plain(c.activeFx);const before=JSON.stringify(c.activeFx);
 assert.equal(e.acTotal(c),base+5);assert.equal(e.targetInfoOf('foe:'+foe.id).ac,15);assert.equal(JSON.stringify(c.activeFx),before);
 c.activeFx.pop();delete c.__fxC;assert.equal(e.acTotal(c),base+5,'the older cast becomes effective again after the newer cast expires');
});

test('full Russian names, English names and abbreviations produce the same class access',()=>{
 const {e,g,a,rows}=world(),c=Object.assign(e.buildBlank(),{cls:'Волшебник',level:5});e.state().chars.push(c);a.characterAdopt(c);a.applyClassSlots(c);
 for(const label of ['Влш, Чрд','Волшебник, Чародей','Wizard, Sorcerer'])assert.equal(a.magicClassSpellAvailable(c,{id:'label-check',n:'Test',l:2,c:label}),true);
 for(const s of rows.filter(s=>s.grimoire.status!=='active'))assert.equal(a.magicClassSpellAvailable(c,s),false,s.id);
});
test('free MP includes canonical own class cards once and never a revised or third party spell',async()=>{
 const {e,g,a,rows}=world(),c=Object.assign(e.buildBlank(),{cls:'Волшебник',level:5});e.state().chars.push(c);a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);c.spellbook=[];await a.magicSwitch('mp','free');
 const entries=a.characterSpellEntries(c);assert.ok(entries.length>80);assert.equal(new Set(entries.map(x=>x.spellId)).size,entries.length);for(const entry of entries){const s=g.spellOf(entry.spellId);assert.ok(g.grimoireActive(s));assert.ok(s.l<=3);assert.ok(g.spellClassTokens(s).includes('Влш'));}assert.deepEqual(plain(c.spellbook),[]);
});
test('an isolated import without SRD rows cannot bypass the 2014 boundary or unlock foreign spells in free MP',async()=>{
 const {e,g,a}=world(),c=Object.assign(e.buildBlank(),{id:'isolated-wizard',cls:'Волшебник',level:5});e.state().chars.push(c);a.withoutPresentation();a.characterAdopt(c);a.applyClassSlots(c);c.spellbook=[];
 const foreign=[{id:'foreign-2024',n:'Foreign 2024',l:1,c:'Влш',catalogSource:{documentKey:'srd-2024'}},{id:'foreign-other',n:'Other source',l:1,c:'Влш',catalogSource:{documentKey:'tob'}},{id:'foreign-ruleset',n:'Revised rule',l:1,c:'Влш',rulesetRef:{id:'dnd5e-2024-reference'}}],custom={id:'custom-2014',n:'Custom 2014',l:1,c:'Влш'};
 e.state().spells.splice(0,e.state().spells.length,...foreign,custom);g.reconcile(e.state().spells,[c]);await a.magicSwitch('mp','free');
 for(const sp of foreign){assert.equal(g.grimoireActive(sp),false);assert.equal(a.magicClassSpellAvailable(c,sp),false);}
 assert.equal(g.grimoireActive(custom),true);assert.deepEqual(plain(a.characterSpellEntries(c).map(entry=>entry.spellId)),[custom.id]);
});

test('material costs and consumption come from the source component clause, not machine translation',()=>{
 const {g,rows}=world();for(const [name,cost,consume] of [['Identify',100,0],['Revivify',300,1],['Glyph of Warding',200,1],['Gate',5000,0]]){
 const sp=rows.find(s=>g.grimoireActive(s)&&s.grimoire.english===name),m=g.spellRuleOf(sp).components.material;assert.equal(m.cost,cost,name);assert.equal(m.consume,consume,name);}
});
test('Burning Hands uses 3d6 plus one per higher circle after migration; no invented once per combat limit',()=>{
 const {e,g}=world(),sp=g.spellOf('sp_burning_hands'),caster=Object.assign(e.buildBlank(),{level:3}),target=Object.assign(e.buildBlank(),{id:'target'});e.state().chars.push(caster,target);
 assert.equal(sp.n,'Пылающие руки');const spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:2,target:e.targetInfoOf('ally:target')});const dmg=spec.rows.find(r=>r.type==='dmg');assert.equal(dmg.cnt,4);assert.equal(dmg.sides,6);assert.ok(spec.rows.some(r=>r.type==='save'));assert.equal(spec.meta.half,true);
});
test('Sleep scales its shared pool and skips unconscious, undead, charm-immune and elven targets without spending their HP budget',async()=>{
 const {e,g,a}=world(),caster=Object.assign(e.buildBlank(),{id:'sleep-caster',cls:'Волшебник',level:3,inventory:[{id:'pouch',itemId:'it_reagent_bag',qty:1}]});a.withoutPresentation();a.characterAdopt(caster);a.applyClassSlots(caster);
 const hero=(id,hp,extra={})=>Object.assign(e.buildBlank(),{id,name:id,hp,hpMax:hp},extra),small=hero('small',4),medium=hero('medium',7),large=hero('large',12),asleep=hero('asleep',1,{cond:['Бессознательный']}),undead=hero('undead',1,{creatureType:'нежить'}),charmed=hero('immune-charm',1,{condImmune:['Очарованный']}),elf=hero('elf',1,{race:'Эльф',subrace:'Высший эльф'});a.characterAdopt(elf);
 const targets=[large,asleep,undead,charmed,elf,medium,small];e.state().chars.push(caster,...targets);await a.magicSwitch('mp','free');const sp=g.spellOf('sp_magic_sleep'),spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:2,target:e.targetInfoOf('ally:large')}),pool=spec.rows.find(row=>row.type==='sleep');assert.equal(pool.cnt,7);assert.equal(pool.sides,8);
 const before=JSON.stringify(e.state().chars),extra=targets.slice(1).map(c=>'ally:'+c.id);for(const invalid of [undefined,0,57]){assert.equal(e.castSpellApply(sp.id,caster.id,'ally:large','',undefined,'2',{sleepTotal:invalid},extra),false);assert.equal(JSON.stringify(e.state().chars),before);}
 const values={[pool.key]:11},out=e.resolveOutcome(spec,values),rolls=a.castFormulaRollsBuild(spec,values,out).rolls;assert.equal(e.castSpellApply(sp.id,caster.id,'ally:large','',undefined,'2',rolls,extra),true);assert.equal(a.magicPool(caster).cur,11);
 for(const target of [small,medium])assert.ok(e.effectiveConditions(target).includes('Бессознательный'),target.id);for(const target of [large,undead,charmed,elf])assert.equal(e.effectiveConditions(target).includes('Бессознательный'),false,target.id);
 assert.equal((asleep.activeFx||[]).length,0);assert.equal(small.activeFx.find(f=>f.id===sp.id).castId,medium.activeFx.find(f=>f.id===sp.id).castId);
});

test('search recognizes aliases, English original and ё/е; cards do not claim official Russian translation',()=>{
 const {g}=world(),sp=g.spellOf('sp_врата');assert.ok(g.rules.matches(sp,'Gate'));assert.ok(g.rules.matches(sp,'Ворота'));assert.ok(g.rules.matches(g.spellOf('sp_полет'),'полет'));
 assert.match(g.spellCardHTML(sp),/не сверен/);assert.doesNotMatch(g.spellCardHTML(sp),/ячейка более высокого круга выгоды не дает/);assert.ok(g.grimoireDuplicateName('Gate'));assert.ok(g.grimoireDuplicateName('Ворота'));
});
test('Magic Missile shares one d4, allocates every dart and applies resistance per dart; resources are paid once',async()=>{
 const {e,g,a}=world(),caster=Object.assign(e.buildBlank(),{id:'caster',cls:'Волшебник',level:3}),first=Object.assign(e.buildBlank(),{id:'first',hp:30,hpMax:30}),second=Object.assign(e.buildBlank(),{id:'second',hp:30,hpMax:30});
 e.state().chars.push(caster,first,second);a.withoutPresentation();a.characterAdopt(caster);a.applyClassSlots(caster);caster.spellbook=[];await a.magicSwitch('mp','free');
 first.activeFx=[{uid:'force-resistance',id:'force-resistance',k:'custom',fx:[{stat:'damage.rule',mode:'grant',value:{mode:'resist',types:['силовое поле'],when:''}}]}];
 const sp=g.spellOf('sp_magic_missile');
 const roll=(target,darts)=>{const spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:2,projectileCount:darts,target:e.targetInfoOf(target)});assert.equal(spec.rows.filter(r=>r.type==='dmg').length,1);assert.equal(spec.rows.some(r=>r.type==='atk'||r.type==='save'),false);const values={dmg0:2},out=e.resolveOutcome(spec,values);return a.castFormulaRollsBuild(spec,values,out).rolls;};
 const r1=roll('ally:first',2),r2=roll('ally:second',2);assert.equal(r1.dmgRaw,6);assert.equal(r1.dmgTotal,2);assert.equal(r2.dmgTotal,6);
 const before=JSON.stringify([caster,first,second]);assert.equal(e.castSpellApply(sp.id,caster.id,'ally:first','',undefined,'2',r1,['ally:second'],{'ally:second':{...r2,magicMissile:{...r2.magicMissile,die:4}}}),false);assert.equal(JSON.stringify([caster,first,second]),before);
 assert.equal(e.castSpellApply(sp.id,caster.id,'ally:first','',undefined,'2',r1,['ally:second'],{'ally:second':r2}),true);assert.equal(first.hp,28);assert.equal(second.hp,24);assert.equal(a.magicPool(caster).cur,11);
});
test('Shield blocks Magic Missile for its protected target and Witch Bolt cannot grant a false attack buff',async()=>{
 const {e,g,a}=world(),caster=Object.assign(e.buildBlank(),{id:'caster',cls:'Волшебник',level:3}),target=Object.assign(e.buildBlank(),{id:'target',hp:30,hpMax:30});e.state().chars.push(caster,target);a.withoutPresentation();a.characterAdopt(caster);a.applyClassSlots(caster);await a.magicSwitch('mp','free');
 target.activeFx=[{uid:'shield',k:'spell',id:'sp_щит',fx:[{stat:'spell.magicMissileImmune',mode:'set',value:1}]}];
 const sp=g.spellOf('sp_magic_missile'),spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:1,target:e.targetInfoOf('ally:target')}),values={dmg0:4},out=e.resolveOutcome(spec,values);assert.equal(out.dmgRaw,15);assert.equal(out.dmgTotal,0);const built=a.castFormulaRollsBuild(spec,values,out);
 assert.equal(e.castSpellApply(sp.id,caster.id,'ally:target','',undefined,'1',built.rolls),true);assert.equal(target.hp,30);assert.equal(a.magicPool(caster).cur,12);
 e.closeCastModal();const before=JSON.stringify([caster,target]);assert.equal(e.castSpellApply('sp_ведьмин_снаряд',caster.id,'ally:target','',undefined,'1',{hit:true,dmgRaw:8,dmgTotal:8}),false);assert.equal(JSON.stringify([caster,target]),before);assert.deepEqual(plain(g.spellOf('sp_ведьмин_снаряд').mechanics.effects),[]);
});
test('import migrates duplicate references and hiding a card does not erase character history',async()=>{
 const {e,g,a,rows}=world(),c=Object.assign(e.buildBlank(),{id:'old-wizard',cls:'Волшебник',level:5});a.characterAdopt(c);a.applyClassSlots(c);const alias=rows.find(s=>s.grimoire.status==='alias'&&s.open5e?.originalName==='Fireball'),canonical=g.spellOf(alias.id);c.spellbook=[{spellId:alias.id,prep:true},{spellId:canonical.id,prep:false}];e.state().chars.push(c);
 const exported=e.dndWorldExportPayload();assert.equal((await e.dndWorldImportPayload(plain(exported))).ok,true);const loaded=e.state().chars.find(x=>x.id===c.id);assert.equal(loaded.spellbook.filter(x=>x.spellId===canonical.id).length,1);
 const card=g.spellOf(canonical.id);card.grimoire.hidden=true;const before=JSON.stringify(loaded);assert.equal(a.spellAccessCheck(loaded,card,loaded.spellbook.find(x=>x.spellId===card.id)).ok,false);g.reconcile(e.state().spells,e.state().chars);assert.equal(card.grimoire.hidden,true);assert.equal(JSON.stringify(loaded),before);
});

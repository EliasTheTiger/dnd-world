import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
const reference=JSON.parse(fs.readFileSync('tests/fixtures/alchemist-drive-deck-index.json','utf8'));
function catalog(){const context=vm.createContext({});for(const path of ['data/dnd5e/srd51-spell-facts.js','scripts/artificer-catalog.js','scripts/grimoire-rules.js','scripts/artificer-rules.js'])vm.runInContext(fs.readFileSync(path,'utf8'),context,{filename:path});return {c:context.DND_ARTIFICER_CATALOG,g:context.DND_GRIMOIRE_RULES,r:context.DndArtificerRules,facts:context.DND_SRD51_SPELL_FACTS.spells};}
const plain=value=>JSON.parse(JSON.stringify(value));
function srdRows(facts){return Object.entries(facts).map(([english,f])=>({id:'test_'+english,n:english,l:f.level,c:f.classes.join(', '),x:'',cm:f.components,open5e:{originalName:english},catalogSource:{documentKey:'srd-2014'},rulesetRef:{id:'dnd5e-2014-local'}}));}
test('Tasha artificer list supplies every cantrip and first-circle choice without granting alchemist-only spells to the class',()=>{
 const {c,g,facts}=catalog(),rows=srdRows(facts);g.reconcile(rows);const report=c.audit(rows);
 assert.deepEqual(plain(report.missing),[]);assert.deepEqual(plain(report.duplicates),[]);assert.deepEqual(plain(report.levels),{0:23,1:18,2:24,3:16,4:11,5:8});
 for(const name of ['Healing Word','Ray of Sickness']){const sp=rows.find(r=>g.active(r)&&c.identity(r)===g.normalize(name));assert.ok(sp,name);assert.equal(g.classTokens(sp.c).includes('Изб'),false,name+' is granted by subclass only');}
 for(const [english,fact] of Object.entries(facts)){const sp=rows.find(r=>g.active(r)&&c.identity(r)===g.normalize(english));assert.ok(sp);assert.deepEqual(plain(g.classTokens(sp.c).filter(s=>s!=='Изб')),plain(g.classTokens(fact.classes.join(', '))),english+' keeps every original SRD class');}
});
test('catalog installation preserves canonical spell identities and is byte-idempotent',()=>{
 const {c,g,facts}=catalog(),rows=srdRows(facts);g.reconcile(rows);const fire=rows.find(r=>r.open5e?.originalName==='Fire Bolt');assert.equal(fire.id,'test_Fire Bolt');const before=JSON.stringify(rows);g.reconcile(rows);assert.equal(JSON.stringify(rows),before);assert.equal(rows.filter(r=>g.active(r)&&c.identity(r)==='fire bolt').length,1);
 const report=g.audit(rows);assert.deepEqual(plain(report.errors),[]);assert.equal(rows.filter(r=>r.id.startsWith('sp_artificer_')).length,c.definitions.length);
});
test('a 2024 same-name row never substitutes for the missing 2014 Ray of Sickness',()=>{
 const {c,g,facts}=catalog(),rows=srdRows(facts);rows.push({id:'wrong-ray',n:'Ray of Sickness',l:1,c:'Wizard',open5e:{originalName:'Ray of Sickness'},catalogSource:{documentKey:'srd-2024'},rulesetRef:{id:'dnd5e-2024-reference'}});g.reconcile(rows);
 assert.equal(g.active(rows.find(r=>r.id==='wrong-ray')),false);const ray=rows.find(r=>r.id==='sp_artificer_ray_of_sickness');assert.ok(g.active(ray));assert.equal(ray.artificerSpell.save,'con');assert.match(ray.x,/Успешный спасбросок не отменяет урон/);assert.equal(c.audit(rows).duplicates.length,0);
});
test('saved custom editorial changes and live resource references survive a catalog update',()=>{
 const {c,g,facts}=catalog(),rows=srdRows(facts);g.reconcile(rows);const sp=rows.find(r=>r.id==='sp_artificer_ray_of_sickness');sp.n='Наш луч';sp.x='Домашнее правило';sp.grimoire.translation='custom';sp.mechanics={origin:'editor',special:'house',spell:{access:{classes:['Чрд','Влш']}}};const save=JSON.stringify(sp.mechanics),hero={spellbook:[{spellId:sp.id,prep:true,used:true,cur:0}],slots:{1:{max:3,cur:1}},activeFx:[{id:sp.id,castId:'in-progress'}]};
 c.install(rows);g.reconcile(rows);g.migrateCharacter(hero,rows);assert.equal(sp.n,'Наш луч');assert.equal(sp.x,'Домашнее правило');assert.equal(JSON.stringify(sp.mechanics),save);assert.equal(hero.spellbook[0].cur,0);assert.equal(hero.slots[1].cur,1);assert.equal(hero.activeFx[0].castId,'in-progress');
});
test('new cards have original Russian summaries, edition-specific source links, and deliberate runtime availability',()=>{
 const {c}=catalog();for(const sp of c.definitions){assert.equal(sp.grimoire.edition,'2014');assert.equal(sp.rulesSource.summary,'original-project');assert.match(sp.rulesSource.url,/^https:\/\/www\.dndbeyond\.com\//);assert.ok(sp.x.length>40,sp.n);assert.ok(sp.l>1||sp.artificerSpell.special,sp.n+' needs a level-three runtime handler');assert.equal(sp.custom,false);}
 assert.equal(c.classNamesFor("Bigby's Hand")[0],'Изб');assert.equal(c.classNamesFor("Mordenkainen's Private Sanctum")[0],'Изб');assert.equal(c.classNamesFor('Healing Word').length,0);
});
test('the CRC-verified archive matches exactly 100 class spells, 10 subclass unlocks and the separate level-15 Heal feature',()=>{
 const {c,r}=catalog(),identity=english=>c.identity({grimoire:{english}}),classCards=reference.cards.filter(card=>card.membership.kind==='class-list'),subclass=reference.cards.filter(card=>card.membership.kind==='alchemist-spells'),feature=reference.cards.filter(card=>card.membership.kind==='chemical-mastery');
 assert.equal(classCards.length,100);assert.equal(subclass.length,10);assert.equal(feature.length,1);assert.equal(feature[0].english,'Heal');assert.equal(feature[0].membership.artificerLevel,15);assert.deepEqual(plain(c.classNamesFor('Heal')),[]);
 const actual=Object.entries(c.spellLists).flatMap(([level,names])=>names.map(name=>level+':'+identity(name))).sort(),expected=classCards.map(card=>card.level+':'+identity(card.english)).sort();assert.deepEqual(plain(actual),expected);assert.deepEqual(plain(r.alchemistSpells.flatMap(row=>row.spells.map(name=>row.level+':'+identity(name))).sort()),subclass.map(card=>card.membership.artificerLevel+':'+identity(card.english)).sort());
 const available=classCards.filter(card=>card.level<=1).concat(subclass.filter(card=>card.membership.artificerLevel<=3));assert.equal(available.length,43);assert.equal(actual.filter(key=>/^[01]:/.test(key)).length+plain(r.alwaysPrepared({cls:'Изобретатель',subcls:'Алхимик',level:3})).length,43);
});
test('every archive title finds its canonical card and aliases preserve edited titles, IDs and idempotence',()=>{
 const {c,g,facts}=catalog(),rows=srdRows(facts);g.reconcile(rows);for(const card of reference.cards){const spell=rows.find(row=>g.active(row)&&c.identity(row)===c.identity({grimoire:{english:card.english}}));assert.ok(spell,card.english);assert.ok(g.matches(spell,card.name),card.name);}
 const spell=rows.find(row=>row.grimoire?.english==='Lightning Lure'),id=spell.id;spell.n='Наше лассо';spell.grimoire.translation='custom';c.install(rows);g.reconcile(rows);assert.equal(spell.n,'Наше лассо');assert.equal(spell.id,id);assert.ok(g.matches(spell,'Притягивающая молния'));const before=JSON.stringify(rows);c.install(rows);assert.equal(JSON.stringify(rows),before);
});
test('five archive additions retain exact casting facts and costly consumed material while higher-circle execution stays blocked',()=>{
 const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});const names=['Vortex Warp','Air Bubble','Kinetic Jaunt',"Ashardalon's Stride",'Create Spelljamming Helm'],rows=names.map(name=>e.state().spells.find(sp=>sp.grimoire?.english===name&&e.grimoireApi.grimoireActive(sp)));
 for(const [index,sp]of rows.entries()){assert.ok(sp,names[index]);assert.equal(sp.mechanics.mode,'manual',sp.n);assert.equal(sp.ritual,false,sp.n);assert.match(sp.rulesSource.url,/\/spells\/\d+-/);assert.ok(sp.artificerSpell.rulesFacts);assert.equal(e.artificerBasicApi.spellPreflight(sp,{cls:'Волшебник'},'none',null,null,String(sp.l),null,[],{},{}).ok,false);}
 assert.equal(rows[0].artificerSpell.rulesFacts.excludeCaster,true);assert.equal(rows[0].artificerSpell.rulesFacts.upcastRangeFeet,30);assert.equal(rows[1].cm,'С');assert.equal(rows[1].d,'24 часа');assert.equal(rows[1].conc,false);assert.equal(rows[1].artificerSpell.rulesFacts.upcastBubbles,2);assert.equal(rows[2].conc,true);assert.equal(rows[2].artificerSpell.rulesFacts.endInCreatureSpace.damage,'1d8');assert.equal(rows[3].conc,true);assert.equal(rows[3].artificerSpell.rulesFacts.oncePerTargetPerTurn,true);assert.equal(rows[3].artificerSpell.rulesFacts.alliesAffected,true);assert.equal(rows[4].mechanics.components.material.cost,5000);assert.equal(rows[4].mechanics.components.material.consume,1);assert.equal(rows[4].artificerSpell.rulesFacts.maximumSize,'Large');
});

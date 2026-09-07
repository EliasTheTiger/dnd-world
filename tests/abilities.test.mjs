import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
function world(){
 const e=loadRuntimeIntegrationEngine(),a=e.abilitiesApi,c=Object.assign(e.buildBlank(),{name:'Воин',cls:'Воин',level:17,hp:3,hpMax:100});
 e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.quiet();e.guardRandom();return {e,a,c};
}
function source(e,name,edition='srd-2014'){return e.state().abilities.find(ab=>ab.catalogSource?.documentKey===edition&&ab.open5e?.originalName===name);}
test('every catalog ability has a Russian name, edition and honest translation provenance',()=>{
 const {e,a}=world();assert.equal(e.catalogs.abilities.length,693);
 for(const ab of e.catalogs.abilities){assert.match(ab.n,/[А-Яа-яЁё]/);assert.match(ab.x,/[А-Яа-яЁё]/);assert.equal(ab.abilityReview.revision,a.rules.revision);assert.ok(ab.abilityReview.descriptionStatus);}
 assert.equal(source(e,'Action Surge').n,'Порыв к действию');assert.equal(source(e,'Grappler').n,'Рукопашный борец');assert.equal(source(e,'Font of Inspiration').n,'Источник вдохновения');
 assert.equal(source(e,'Restoring Touch','srd-2024').n,'Восстанавливающее касание');
 assert.equal(source(e,'Alignment').n,'Мировоззрение');assert.equal(source(e,'Cantrip').n,'Фокус');assert.equal(source(e,'Tranquility').n,'Безмятежность');
 assert.match(source(e,'Fey Ancestry').x,/испытания/);assert.doesNotMatch(source(e,'Fey Ancestry').x,/спасброс/);
 assert.match(a.abilityCardHTML(source(e,'Grappler')),/сверено с глоссарием Hobby World/);assert.doesNotMatch(a.abilityCardHTML(source(e,'Grappler','srd-2024')),/>сверено с глоссарием Hobby World/);
});
test('Grappler 2014 uses a contested grapple, both restrained participants and a requirement',()=>{
 const {e}=world(),ab=source(e,'Grappler');assert.match(ab.x,/Сила \(Атлетика\).*Ловкости \(Акробатики\)/);assert.match(ab.x,/оба участника/);assert.match(ab.x,/ничьей или проигрыше/);assert.equal(ab.mechanics.mode,'manual');
});
test('search supports old names, English identity, ё/е, owners and edits without stale cache',()=>{
 const {e,a}=world(),ab=source(e,'Action Surge');assert.ok(a.rules.matches(ab,'всплеск действий'));assert.ok(a.rules.matches(ab,'action surge'));assert.ok(a.rules.matches(ab,'воин'));assert.ok(a.rules.matches(source(e,'Danger Sense'),'чутьё'));
 ab.x='Неожиданная правка';assert.ok(a.rules.matches(ab,'неожиданная'));ab.x='Иное';assert.equal(a.rules.matches(ab,'неожиданная'),false);
});
test('reconciliation is idempotent, retains explicit local mechanics and never refunds a spent charge',()=>{
 const {e,a,c}=world(),ab=e.state().abilities.find(ab=>ab.id==='ab_lg_surge');c.abilities=[{abilityId:ab.id,cur:0,notes:'потрачено'}];
 const mechanics=JSON.stringify(ab.mechanics),before=JSON.stringify(e.state());a.reconcile(e.state().abilities);a.reconcile(e.state().abilities);assert.equal(JSON.stringify(e.state()),before);assert.equal(JSON.stringify(ab.mechanics),mechanics);assert.equal(c.abilities[0].cur,0);
 ab.abilityReview.custom=true;ab.n='Правка мастера';ab.x='Мои правила';a.reconcile(e.state().abilities);assert.equal(ab.n,'Правка мастера');assert.equal(ab.x,'Мои правила');
});
test('catalog pages cover all results and filter editions',()=>{
 const {a}=world();a.filters.edition='';a.renderAbilitiesDB();assert.match(a.html('tab-abilitiesdb'),/Далее/);const first=a.html('tab-abilitiesdb');a.filters.page=1;a.renderAbilitiesDB();assert.notEqual(a.html('tab-abilitiesdb'),first);
 a.filters.q='Action Surge';a.filters.edition='2014';a.renderAbilitiesDB();assert.equal(a.filters.page,0);assert.match(a.html('tab-abilitiesdb'),/Порыв к действию/);assert.doesNotMatch(a.html('tab-abilitiesdb'),/D&D 2024 · справочная карточка/);
});
test('old saved editorial overrides are detected before automatic migration',()=>{
 const {e,a}=world(),ab=source(e,'Grappler');delete ab.abilityReview;ab.n='Борец по правилам мастера';ab.x='Сохранённые домашние правила';const mechanics=JSON.stringify(ab.mechanics);
 a.reconcile([ab]);assert.equal(ab.n,'Борец по правилам мастера');assert.equal(ab.x,'Сохранённые домашние правила');assert.equal(ab.abilityReview.custom,true);assert.equal(JSON.stringify(ab.mechanics),mechanics);
});
test('assignment rejects missing abilities, charge resets, 2024 feats and unmet prerequisites',()=>{
 const {e,a,c}=world(),surge=source(e,'Action Surge'),grappler=source(e,'Grappler');c.ab.str=12;
 assert.equal(a.addAbilityFromDB('missing'),false);assert.equal(a.addAbilityFromDB(grappler.id),false);assert.equal(a.addAbilityFromDB(source(e,'Grappler','srd-2024').id),false);assert.equal(c.abilities.length,0);
 delete c.ab.str;assert.equal(a.addAbilityFromDB(grappler.id),false);
 a.addAbilityFromDB(surge.id);assert.equal(c.abilities[0].cur,2);c.abilities[0].cur=0;assert.equal(a.addAbilityFromDB(surge.id),false);assert.equal(c.abilities[0].cur,0);c.ab.str=13;a.addAbilityFromDB(grappler.id);assert.equal(c.abilities.length,2);
});
test('Second Wind heals from player input, spends once and restores on a short rest',()=>{
 const {e,a,c}=world(),ab=source(e,'Second Wind');a.addAbilityFromDB(ab.id);
 const spec=e.rollSpecOf(ab,{kind:'ability',caster:c,target:e.targetInfoOf('ally:'+c.id)}),rolls=e.resolveOutcome(spec,Object.fromEntries(spec.rows.map(row=>[row.key,row.cnt||row.min||1])));
 assert.ok(spec.rows.length);assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,rolls),true,e.elementText('saveStatus'));assert.equal(c.hp,21);assert.equal(c.abilities[0].cur,0);
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,rolls),false);assert.equal(c.hp,21);e.charactersApi.refreshShortRestResources(c);assert.equal(c.abilities[0].cur,1);
});
test('Action Surge has two uses at fighter 17, one per turn, with no extra bonus action',()=>{
 const {e,a,c}=world(),ab=source(e,'Action Surge');a.addAbilityFromDB(ab.id);
 const combat=e.blankCombat();Object.assign(combat,{active:true,id:'fight',round:1,turnIndex:0,order:[{kind:'ally',id:c.id,key:'ally:'+c.id,initiative:10}],turn:{actorKey:'ally:'+c.id,actionsUsed:0,actionMax:1,bonusUsed:false,abilityUsed:{}}});e.setState({...e.state(),combat});a.setCast({kind:'ability',abilityId:ab.id,casterId:c.id,combatActorKey:'ally:'+c.id,combatCost:'turnfree'});
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,{notes:[],verdict:[]}),true,e.elementText('saveStatus'));assert.equal(c.abilities[0].cur,1);assert.equal(e.state().combat.turn.actionMax,2);assert.equal(e.state().combat.turn.bonusUsed,false);
 const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,{notes:[],verdict:[]}),false);assert.equal(JSON.stringify(e.state()),before);e.charactersApi.refreshShortRestResources(c);assert.equal(c.abilities[0].cur,2);
});
test('unknown saves, attacks and contests cannot spend charges or apply lasting effects',()=>{
 const {e,c}=world();
 for(const resolution of [{save:{key:'wis',dc:{source:'fixed',value:13}}},{attack:{mode:'melee'}},{contest:{skill:'Атлетика'}}]){
 const ab={id:'regression',n:'Устрашение',uses:1,mode:'active',mechanics:{schemaVersion:1,mode:'structured',origin:'explicit',role:'active',activation:{cost:'action'},target:{kind:'self',base:1},combat:{target:'self'},resource:{uses:1},duration:{kind:'rounds',rounds:2},resolution:{...resolution,rolls:[]},effects:[{stat:'condition',mode:'text',value:'Испуганный'}]}};
 e.grimoireApi.upgradeAbility(ab);e.state().abilities.push(ab);c.abilities=[{abilityId:ab.id,cur:1}];const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,{notes:[],verdict:[],effectAllowed:true}),false);assert.equal(JSON.stringify(e.state()),before);e.state().abilities.pop();
 }
});

test('a custom ability written with Hobby World saving-throw terms retains its outcome gate',()=>{
 const {e,a,c}=world(),ab={id:'hw-save',n:'Устрашающий взгляд',type:'class',mode:'active',uses:1,rest:'короткий отдых',x:'Действием цель совершает испытание Мудрости Сл 13. При провале она становится испуганной на 2 раунда.'};
 const defender=Object.assign(e.buildBlank(),{name:'Защитник'});e.state().chars.push(defender);
 e.grimoireApi.upgradeAbility(ab);e.state().abilities.push(ab);a.addAbilityFromDB(ab.id);
 assert.equal(ab.mechanics.resolution.save.key,'wis');const before=JSON.stringify(e.state());
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+defender.id,{effectAllowed:true}),false);assert.equal(JSON.stringify(e.state()),before);
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+defender.id,{saveOk:true,effectAllowed:true}),true,e.elementText('saveStatus'));assert.equal(c.abilities[0].cur,0);assert.equal(e.effectiveConditions(defender).includes('Испуганный'),false);
});
test('invalid results, absent assignments and stale targets do not spend a use',()=>{
 const {e,a,c}=world(),ab=source(e,'Second Wind');assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,{healTotal:5}),false);a.addAbilityFromDB(ab.id);
 for(const rolls of [{},{healTotal:NaN},{healTotal:Infinity},{healTotal:1.5},{healTotal:-1}]){const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,rolls),false);assert.equal(JSON.stringify(e.state()),before);}
 const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(ab.id,c.id,'ally:missing',{healTotal:5}),false);assert.equal(JSON.stringify(e.state()),before);
});
test('waiting for a healing die and cancelling leaves all charges and HP unchanged',()=>{
 const {e,a,c}=world(),ab=source(e,'Second Wind');a.addAbilityFromDB(ab.id);const before=JSON.stringify(e.state());
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,null),true);assert.ok(a.roll());assert.equal(JSON.stringify(e.state()),before);e.charactersApi.rollCancel();assert.equal(JSON.stringify(e.state()),before);
});
test('a successful save cannot apply a condition even with a contradictory effectAllowed flag',()=>{
 const {e,a,c}=world(),ab={id:'fear-test',n:'Пугающий облик',uses:1,mode:'active',mechanics:{schemaVersion:1,mode:'structured',origin:'explicit',role:'active',activation:{cost:'action'},target:{kind:'self',base:1},combat:{target:'self'},resource:{uses:1},duration:{kind:'rounds',rounds:2},resolution:{save:{key:'wis',dc:{source:'fixed',value:13}},rolls:[]},effects:[{stat:'condition',mode:'text',value:'Испуганный'}]}};
 e.grimoireApi.upgradeAbility(ab);e.state().abilities.push(ab);a.addAbilityFromDB(ab.id);
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,{saveOk:true,effectAllowed:true}),true);assert.equal(c.abilities[0].cur,0);assert.equal(e.effectiveConditions(c).includes('Испуганный'),false);
});
test('temporary ability buffs on heroes carry the declared duration and cast identity',()=>{
 const {e,a,c}=world(),ab={id:'buff-test',n:'Временная защита',uses:1,mode:'active',mechanics:{schemaVersion:1,mode:'structured',origin:'explicit',role:'active',activation:{cost:'action'},target:{kind:'self',base:1},combat:{target:'self'},resource:{uses:1},duration:{kind:'rounds',rounds:2,label:'2 раунда'},resolution:{rolls:[]},effects:[{stat:'ac',mode:'add',value:2}]}};
 e.grimoireApi.upgradeAbility(ab);e.state().abilities.push(ab);a.addAbilityFromDB(ab.id);const ac=e.acTotal(c);
 assert.equal(e.useAbilityApply(ab.id,c.id,'ally:'+c.id,null),true);const fx=c.activeFx.find(f=>f.id===ab.id);assert.equal(fx.casterId,c.id);assert.ok(fx.castId);assert.equal(fx.expiresAtRound,e.state().fxRound+2);assert.equal(e.acTotal(c),ac+2);
 a.advanceFxRound(2);assert.equal(e.acTotal(c),ac);assert.equal(c.activeFx.some(f=>f.id===ab.id),false);
});

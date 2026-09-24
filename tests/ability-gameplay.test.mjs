import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';
function world(){
 const e=loadRuntimeIntegrationEngine(),a=e.abilitiesApi,c=Object.assign(e.buildBlank(),{name:'Испытатель',cls:'Воин',level:17,hp:20,hpMax:200,ab:{str:16,dex:14,con:12,int:18,wis:16,cha:18}}),ally=Object.assign(e.buildBlank(),{name:'Союзник',hp:1,hpMax:300});
 e.setState({...e.catalogs,chars:[c,ally],activeCharId:c.id});a.quiet();e.guardRandom();return {e,a,c,ally};
}
function find(e,name){return e.state().abilities.find(ab=>ab.open5e?.originalName===name&&ab.catalogSource?.documentKey==='srd-2014')||e.state().abilities.find(ab=>ab.open5e?.originalName===name)||e.state().abilities.find(ab=>ab.id===name);}
function give(e,c,ab,cur){const a=e.abilitiesApi;c.abilities.push({abilityId:ab.id,cur:cur??a.abilityMaxUses(c,ab)});e.setState({...e.state()});return c.abilities.at(-1);}

test('all catalog variants have executable rules and clean player cards',()=>{
 const {e,a}=world();
 for(const ab of e.state().abilities){
  assert.notEqual(ab.mechanics.mode,'manual',ab.n);assert.deepEqual(Array.from(a.mechanicsErrors(ab.mechanics,'ability')),[],ab.n);
  const card=a.abilityCardHTML(ab);
  assert.doesNotMatch(card,/CC-BY|https?:|Open5e|SRD|Hobby World|schemaVersion|manualNote|enginePolicy|источник:|перевод проекта|сверено|справочная карточка|движ[ок]|автоисполн|формат последств/i,ab.n);
  assert.match(card,/entry-desc/,ab.n+' has gameplay prose');
 }
});
test('every Hellish Resistance variant halves fire, preserves other damage and can be disabled',()=>{
 const {e,a,c}=world(),group=a.abilityCatalogIndex().groups.find(g=>g.key==='en:hellish resistance');
 for(const ab of group.variants){
  c.abilities=[];give(e,c,ab);assert.equal(e.charactersApi.dmgAfterTraits(c,19,'огонь').amount,9,ab.id);assert.equal(e.charactersApi.dmgAfterTraits(c,19,'холод').amount,19,ab.id);
  c.fxOff=['ability:'+ab.id];e.setState({...e.state()});assert.equal(e.charactersApi.dmgAfterTraits(c,19,'огонь').amount,19);c.fxOff=[];
 }
});
test('skill choices and expertise contribute only the missing proficiency, and remain reversible',()=>{
 const {e,a,c}=world(),expert=find(e,'Expertise'),entry=give(e,c,expert),i=5;
 const skill=a.gameplay.skills.find(s=>s==='Внимательность');assert.ok(a.abilityGameplayChoose(c.id,expert.id,'skill',skill));
 const index=e.charactersApi.rules?11:i;
 const base=e.charactersApi.skillBonus(c,index);assert.equal(base.p,2);assert.equal(base.v,15);
 c.skills[skill].p=1;e.setState({...e.state()});assert.equal(e.charactersApi.skillBonus(c,index).v,15);
 assert.equal(a.abilityGameplayChoose(c.id,expert.id,'skill','Несуществующий'),false);assert.equal(entry.choices.skill,skill);
 a.delCharAbility(expert.id);assert.equal(e.charactersApi.skillBonus(c,index).v,9);
});
test('gnome protection requires a magical context; poison advantage and resistance are separate',()=>{
 const {e,a,c}=world();give(e,c,find(e,'Gnome Cunning'));
 assert.equal(e.charactersApi.rollFxEntries(c,'save.int',[]).some(f=>f.mode==='adv'),false);
 assert.equal(e.charactersApi.rollFxEntries(c,'save.int',['magical']).some(f=>f.mode==='adv'),true);
 assert.equal(e.charactersApi.rollFxEntries(c,'save.dex',['magical']).some(f=>f.mode==='adv'),false);
 give(e,c,find(e,'Dwarven Resilience'));assert.equal(e.charactersApi.dmgAfterTraits(c,11,'яд').amount,5);
 assert.equal(e.charactersApi.rollFxEntries(c,'save.con',['poison']).some(f=>f.mode==='adv'),true);
});
test('point resources are spent once without a resource die and insufficient points change nothing',()=>{
 const {e,a,c,ally}=world(),ki=find(e,'Ki'),strike=find(e,'Stunning Strike');give(e,c,ki,2);give(e,c,strike);
 const weapon={n:'Тренировочная дубинка',atk:9,m:3,mode:'melee',within5:true,damage:{cnt:1,sides:4,type:'дробящий'},dt:'дробящий'};
 const pool=a.abilityPoolOf(c,strike),spec=e.rollSpecOf(strike,{kind:'ability',caster:c,target:e.targetInfoOf('ally:'+ally.id),weapon,forceAttack:true,pool});
 assert.ok(!spec.rows.some(r=>r.type==='res'));assert.equal(spec.rows.find(r=>r.type==='save').dc,17);
 const rolls=e.resolveOutcome(spec,{atk:15,wdmg:3,save:1});assert.equal(e.useAbilityApply(strike.id,c.id,'ally:'+ally.id,rolls),true);assert.equal(c.abilities[0].cur,1);assert.ok(e.effectiveConditions(ally).includes('Ошеломлённый'));
 c.abilities[0].cur=0;const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(strike.id,c.id,'ally:'+ally.id,rolls),false);assert.equal(JSON.stringify(e.state()),before);
});
test('chosen resistance changes damage, is locked after choosing and unlocks on long rest',()=>{
 const {e,a,c}=world(),ab=find(e,'Fiendish Resilience'),entry=give(e,c,ab);
 assert.equal(a.abilityGameplayChoose(c.id,ab.id,'element','холод'),true);assert.equal(e.charactersApi.dmgAfterTraits(c,17,'холод').amount,8);
 assert.equal(a.abilityGameplayChoose(c.id,ab.id,'element','огонь'),false);
 e.charactersApi.longRest();assert.equal(entry.choiceLocked,undefined);assert.equal(a.abilityGameplayChoose(c.id,ab.id,'element','огонь'),true);
});
test('cantrip choice grants a castable spell and removes only its own grant',()=>{
 const {e,a,c}=world(),ab=find(e,'Magic Initiate');give(e,c,ab);const sp=e.state().spells.find(sp=>sp.l===0&&e.grimoireApi.grimoireActive(sp));
 assert.equal(a.abilityGameplayBind(c.id,ab.id,sp.id),true);const entry=c.spellbook.find(v=>v.spellId===sp.id);assert.ok(entry);assert.equal(e.charactersApi.spellEntryReady(c,entry,sp),true);
 a.delCharAbility(ab.id);assert.equal(c.spellbook.some(v=>v.spellId===sp.id),false);
 c.spellbook.push({spellId:sp.id,granted:true});give(e,c,ab);a.abilityGameplayBind(c.id,ab.id,sp.id);a.delCharAbility(ab.id);assert.equal(c.spellbook.some(v=>v.spellId===sp.id),true);
});
test('active wards expire, charges survive reload, and cleansing preserves unrelated effects',()=>{
 const {e,a,c,ally}=world(),ward=find(e,'Full Metal'),entry=give(e,c,ward),base=e.acTotal(ally);
 assert.equal(e.useAbilityApply(ward.id,c.id,'ally:'+ally.id,null),true);assert.equal(entry.cur,0);assert.equal(e.acTotal(ally),base+2);
 a.reconcile(e.state().abilities);assert.equal(entry.cur,0);a.advanceFxRound(100);assert.equal(e.acTotal(ally),base);
 const cleanse=find(e,'Cleansing Touch');give(e,c,cleanse);ally.cond=['Испуганный','Сбитый с ног'];ally.activeFx=[{id:'mixed',uid:'mixed',fx:[{stat:'condition',mode:'text',value:'Отравленный'},{stat:'ac',mode:'add',value:1}]}];
 assert.equal(e.useAbilityApply(cleanse.id,c.id,'ally:'+ally.id,null),true);assert.deepEqual(Array.from(ally.cond),['Сбитый с ног']);assert.equal(ally.activeFx[0].fx.length,1);assert.equal(e.acTotal(ally),base+1);
});
test('resource recovery rejects a full pool before spending and restores only up to maximum',()=>{
 const {e,a,c}=world(),ki=find(e,'Ki'),restore=find(e,'Perfect Self'),pool=give(e,c,ki),use=give(e,c,restore);
 const before=JSON.stringify(e.state());assert.equal(e.useAbilityApply(restore.id,c.id,'ally:'+c.id,null),false);assert.equal(JSON.stringify(e.state()),before);
 pool.cur=16;assert.equal(e.useAbilityApply(restore.id,c.id,'ally:'+c.id,null),true);assert.equal(pool.cur,17);assert.equal(use.cur,0);
});
test('every new active catalog variant resolves a declared roll or effect and commits exactly one use',()=>{
 const {e,a}=world(),records=e.state().abilities.filter(ab=>a.gameplay.profile(ab)?.role==='active');let count=0;
 for(const ab of records){
  const p=a.gameplay.profile(ab),c=Object.assign(e.buildBlank(),{cls:'Воин',level:17,hp:10,hpMax:300,ab:{str:18,dex:14,con:12,int:16,wis:16,cha:18},slots:{1:{max:4,cur:0}}}),target=Object.assign(e.buildBlank(),{hp:100,hpMax:400,cond:['Испуганный','Очарованный','Отравленный']});
  e.setState({...e.catalogs,chars:[c,target],activeCharId:c.id});give(e,c,ab);
  const poolKey=p.spendPool||p.restore?.pool;
  if(poolKey){const provider=e.state().abilities.find(row=>a.gameplay.profile(row)?.pool===poolKey&&row.id!==ab.id);assert.ok(provider,ab.n+' provider');give(e,c,provider,p.restore?0:undefined);}
  const targetKey='ally:'+(p.target==='self'||!p.target?c.id:target.id),beforeHp=(p.target==='self'||!p.target?c:target).hp;
  const weapon={n:'Короткий меч',atk:10,m:4,mode:'melee',within5:true,damage:{cnt:1,sides:6,type:'колющий'},dt:'колющий'},pool=a.abilityPoolOf(c,ab);
  const spec=e.rollSpecOf(ab,{kind:'ability',caster:c,target:e.targetInfoOf(targetKey),weapon:p.weapon?weapon:null,forceAttack:!!p.weapon,pool});
  const values=Object.fromEntries(spec.rows.flatMap(row=>{
   const v=row.natural?(row.type==='save'||row.type==='tcheck'?1:15):row.fixed?0:row.cnt||1;
   return [[row.key,v],...(row.adv?[[row.key+'_2',v]]:[])];
  })),out=e.resolveOutcome(spec,values),valid=e.validateFormulaValues(spec,values,out);
  assert.equal(valid.ok,true,ab.n+': '+valid.errors.join('; '));
  assert.equal(e.useAbilityApply(ab.id,c.id,targetKey,out),true,ab.n+': '+e.elementText('saveStatus'));
  const affected=p.target==='self'||!p.target?c:target;
  if(ab.uses!=null)assert.equal(c.abilities.find(v=>v.abilityId===ab.id).cur,a.abilityMaxUses(c,ab)-1,ab.n+' use');
  if(p.spendPool)assert.equal(pool.entry.cur,pool.cur-(p.poolCost||1),ab.n+' point cost');
  if(p.effects.length)assert.ok(affected.activeFx.some(f=>f.id===ab.id&&f.fx.length),ab.n+' lasting effect');
  if(p.rolls.some(d=>d.type==='heal'))assert.ok(affected.hp>beforeHp,ab.n+' healing');
  if(p.rolls.some(d=>d.type==='temp'))assert.ok(affected.hpTemp>0,ab.n+' temporary HP');
  if(p.rolls.some(d=>d.type==='dmg')||p.weapon)assert.ok(affected.hp<beforeHp,ab.n+' damage');
  if(p.cleanse)assert.ok(!e.effectiveConditions(affected).includes('Испуганный'),ab.n+' cleanse');
  count++;
 }
 assert.ok(count>190,'all active editions are exercised');
});
test('a successful stun save preserves weapon damage and spends one point without applying stun',()=>{
 const {e,a,c,ally}=world(),ki=find(e,'Ki'),strike=find(e,'Stunning Strike');give(e,c,ki);give(e,c,strike);
 const weapon={n:'Дубинка',atk:9,m:3,mode:'melee',within5:true,damage:{cnt:1,sides:4,type:'дробящий'},dt:'дробящий'},spec=e.rollSpecOf(strike,{kind:'ability',caster:c,target:e.targetInfoOf('ally:'+ally.id),weapon,forceAttack:true,pool:a.abilityPoolOf(c,strike)});
 ally.hp=100;const rolls=e.resolveOutcome(spec,{atk:15,wdmg:4,save:20});assert.equal(rolls.saveOk,true);assert.equal(rolls.dmgTotal,7);
 assert.equal(e.useAbilityApply(strike.id,c.id,'ally:'+ally.id,rolls),true);assert.equal(ally.hp,93);assert.equal(c.abilities[0].cur,16);assert.ok(!e.effectiveConditions(ally).includes('Ошеломлённый'));
});
test('natural proficiency floors change only declared checks and never invent dice',()=>{
 const {e,a,c}=world();give(e,c,find(e,'Reliable Talent'));c.skills.Скрытность.p=1;e.setState({...e.state()});
 assert.equal(a.abilityGameplayCheckNatural(c,'skill.Скрытность',2),10);assert.equal(a.abilityGameplayCheckNatural(c,'skill.История',2),2);assert.equal(a.abilityGameplayCheckNatural(c,'attack.dex',2),2);assert.equal(a.abilityGameplayCheckNatural(c,'skill.Скрытность',null),null);
 give(e,c,find(e,'ab_sx_prothief'));assert.equal(a.abilityGameplayCheckNatural(c,'check.dex',1),12);assert.equal(a.abilityGameplayCheckNatural(c,'skill.Акробатика',1),12);assert.equal(a.abilityGameplayCheckNatural(c,'check.str',1),1);
});

test('related point pools share spent points and reload cannot refill them',()=>{
 const {e,a,c}=world(),ki=find(e,'Ki'),focus=find(e,"Monk's Focus"),strike=find(e,'Stunning Strike');give(e,c,ki,3);give(e,c,focus,9);give(e,c,strike);
 a.reconcileAssignments([c]);assert.deepEqual(Array.from(c.abilities.slice(0,2),x=>x.cur),[3,3]);
 const pool=a.abilityPoolOf(c,strike);pool.entry.cur=2;assert.deepEqual(Array.from(c.abilities.slice(0,2),x=>x.cur),[2,2]);
 a.reconcileAssignments([c]);assert.equal(a.abilityPoolOf(c,strike).cur,2);
});

test('additional rages increase the active limit, without creating an unused resource',()=>{
 const {e,a,c}=world(),rage=find(e,'Rage'),more=find(e,'Rages');give(e,c,rage);assert.equal(a.abilityMaxUses(c,rage),6);
 give(e,c,more);assert.equal(a.abilityMaxUses(c,rage),7);assert.equal(more.uses,null);
 c.fxOff=['ability:'+more.id];e.setState({...e.state()});assert.equal(a.abilityMaxUses(c,rage),6);
});

test('wizard training cannot revoke separately learned armor proficiency',()=>{
 const {e,c}=world();give(e,c,find(e,'ab_wiz_armor'));
 // Another ability or a character's class can supply the missing proficiency.
 const source={id:'armor-test',n:'Обучение тяжёлому доспеху',mode:'passive',mechanics:{schemaVersion:1,mode:'structured',origin:'explicit',role:'passive',effects:[],proficiencies:{armor:{heavy:true}}}};
 e.state().abilities.push(source);c.abilities.unshift({abilityId:source.id});e.setState({...e.state()});assert.equal(e.charactersApi.armorProfsOf(c).heavy,true);
});

test('weapon critical range and extra die affect actual damage without doubling passive bonuses',()=>{
 const {e,a,c,ally}=world();give(e,c,find(e,'Improved Critical'));give(e,c,find(e,'Savage Attacks'));give(e,c,find(e,'Great Weapon Fighting'));
 const spec={rows:[{key:'atk',type:'atk',side:'caster',natural:true,mod:7,adv:0},{key:'dmg',type:'dmg',side:'caster',cnt:1,sides:8,mod:3,dmgType:'рубящий'}],meta:{kind:'weapon',weapon:true,twoHanded:true,caster:c,target:e.targetInfoOf('ally:'+ally.id),attackMode:'melee',within5:true}};
 e.charactersApi.finalizeRollSpec(spec);e.charactersApi.finalizeRollSpec(spec);assert.equal(spec.rows[1].mod,5);assert.equal(spec.rows[1].criticalExtraDice,1);assert.equal(spec.meta.criticalThreshold,19);
 const out=e.resolveOutcome(spec,{atk:19,dmg:24});assert.equal(out.crit,true);assert.equal(out.dmgTotal,29);
});

test('blindsense removes invisibility disadvantage only within its range and while hearing',()=>{
 const {e,c,ally}=world();give(e,c,find(e,'Blindsense'));ally.cond=['Невидимый'];
 const bow=e.state().items.find(it=>it.n==='Короткий лук');assert.ok(bow);
 const spec=distance=>e.weaponSpecOf(c,bow,e.targetInfoOf('ally:'+ally.id),{distanceM:distance,within5:false});
 assert.equal(spec(8).rows.find(r=>r.type==='atk').adv,0);assert.equal(spec(10).rows.find(r=>r.type==='atk').adv,2);
 c.cond=['Глухой'];e.setState({...e.state()});assert.equal(spec(8).rows.find(r=>r.type==='atk').adv,2);
});

test('level-based resources keep the same maximum in action context, combat log and reset',()=>{
 const {e,a,c}=world(),ki=find(e,'Ki'),entry=give(e,c,ki,3);
 assert.deepEqual(JSON.parse(JSON.stringify(e.gameContextFor('ally:'+c.id).resources.abilities[ki.id])),{current:3,max:17});
 assert.equal(e.combatStart([{kind:'ally',id:c.id,nat:10},{kind:'foe',id:e.state().foes[0].id,nat:1}],'Запасы'),true);
 assert.equal(e.combatSnapshotOf({kind:'ally',id:c.id}).abilities[ki.id],'3/17');
 e.resetCustomCharacterForCombat(c);assert.equal(entry.cur,17);assert.equal(a.abilityMaxUses(c,ki),17);
});

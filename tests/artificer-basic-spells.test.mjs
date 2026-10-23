import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function world(english){
 const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});e.economyApi.quiet();e.partyStarterApi.ensureCatalogs();
 const built=e.partyStarterApi.prepare();assert.equal(built.ok,true,built.reason);const c=built.character;
 const f={id:'test-target',n:'Цель',hp:30,hpMax:30,ac:10,abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},saveP:{},activeFx:[],cond:[],condImmune:[],movement:{walk:9}};
 const sp=e.catalogs.spells.find(s=>s.grimoire?.english===english&&s.grimoire?.edition==='2014'&&s.grimoire?.status==='active');assert.ok(sp,english);e.artificerBasicApi.reconcile(sp);
 c.spellbook=c.spellbook.filter(row=>row.spellId!==sp.id);c.spellbook.push({spellId:sp.id,prep:true,access:'prepared',granted:true,alwaysPrepared:true,countsAgainstPreparation:false});e.setState({...e.state(),chars:[c],foes:[f],activeCharId:c.id});e.guardRandom();
 return {e,c,f,sp,a:e.artificerBasicApi};
}
function cast(w,target,a){return w.e.castSpellApply(w.sp.id,w.c.id,target,null,null,'1',null,[],{}, {artificerBasic:a});}
function battle(w){w.e.setState({...w.e.state(),combat:{...w.e.blankCombat(),active:true,id:'test-fight',order:[{kind:'ally',id:w.c.id,initiative:20},{kind:'foe',id:w.f.id,initiative:10}],turnIndex:0,focusKey:'ally:'+w.c.id,turn:{actorKey:'ally:'+w.c.id,actionsUsed:0,actionMax:1,movementUsed:0,bonusUsed:false}}});}
function saveValues(w,target,n){const spec=w.e.arcanumRuntime.saveSpec(target,{key:'dex',dc:13,magic:true},'Скользкий жир');return Object.fromEntries(spec.rows.map(r=>[r.key,n]));}

test('Jump casts through normal engine, spends one slot and triples jumps for ten rounds without concentration',()=>{
 const w=world('Jump'),base=w.e.tabletopApi.jump(w.c,true).long;cast(w,'ally:'+w.c.id,{touch:true});
 assert.equal(w.c.slots[1].cur,2);assert.equal(w.e.tabletopApi.jump(w.c,true).long,base*3);assert.equal(w.e.combatLifecycleApi.concEntriesOf(w.c).length,0);
 w.e.combatLifecycleApi.advanceFxRound(10);assert.equal(w.e.tabletopApi.jump(w.c,true).long,base);
});
test('invalid Jump touch does not spend a spell slot or add an effect',()=>{
 const w=world('Jump'),before=JSON.stringify(w.c);cast(w,'ally:'+w.c.id,{touch:false});assert.equal(JSON.stringify(w.c),before);
});
test('Expeditious Retreat spends a bonus spell action, immediate Dash stacks with action Dash and cannot be repeated that turn',async()=>{
 const w=world('Expeditious Retreat');battle(w);const key='ally:'+w.c.id,speed=w.a.moveMax();w.e.charactersApi.castSpellFx(w.sp.id,w.c.id);assert.equal(w.e.castState().ctx.combatCost,'bonus');cast(w,key,{});
 assert.equal(w.c.slots[1].cur,2);assert.equal(w.e.state().combat.turn.bonusUsed,true);assert.equal(w.a.moveMax(),speed*2);assert.equal(w.a.basicAction('dash'),true);assert.equal(w.a.moveMax(),speed*3);
 assert.equal((await w.a.dash(key)).success,false);assert.equal(w.a.moveMax(),speed*3);
 w.e.state().combat.turn.bonusUsed=false;w.e.state().combat.turn.dash=false;w.e.state().combat.turn.dashCount=0;
 assert.equal((await w.a.dash(key)).success,true);assert.equal(w.a.moveMax(),speed*2);assert.equal(w.c.slots[1].cur,2);
 w.e.combatLifecycleApi.breakConcentration(w.c,'test');w.e.state().combat.turn.bonusUsed=false;assert.equal((await w.a.dash(key)).success,false);
});
test('Grease checks initial saves, applies prone only on failure and keeps difficult terrain after successful saves',()=>{
 const w=world('Grease'),target='foe:'+w.f.id,key='ally:'+w.c.id;const data={zoneName:'У двери',distanceM:6,clearPath:true,allIncluded:true,members:[key,target],values:{[key]:saveValues(w,key,20),[target]:saveValues(w,target,1)}};
 cast(w,key,data);assert.equal(w.c.slots[1].cur,2);assert.equal(w.e.effectiveConditions(w.c).includes('Сбитый с ног'),false);assert.equal(w.e.effectiveConditions(w.f).includes('Сбитый с ног'),true);assert.equal(w.a.inGrease(w.c),true);assert.equal(w.a.inGrease(w.f),true);
 battle(w);assert.equal(w.e.tabletopApi.move(w.c,2).cost,4);assert.equal(w.e.state().combat.turn.movementUsed,4);
 w.e.combatLifecycleApi.advanceFxRound(10);assert.equal(w.a.inGrease(w.c),false);assert.equal(w.e.effectiveConditions(w.f).includes('Сбитый с ног'),true);
});
test('Grease requires all entered saves before spending; entering again asks again and honours condition immunity',async()=>{
 const w=world('Grease'),target='foe:'+w.f.id,key='ally:'+w.c.id,before=JSON.stringify(w.c),base={zoneName:'Мост',distanceM:3,clearPath:true,allIncluded:true,members:[target],values:{}};
 cast(w,key,base);assert.equal(JSON.stringify(w.c),before);cast(w,key,{...base,members:[]});assert.equal(w.c.slots[1].cur,2);
 const entry=w.c.activeFx.find(e=>e.artificerBasic?.kind==='grease');assert.ok(entry);w.f.condImmune=['Сбитый с ног'];
 assert.equal((await w.a.zone(entry.uid,target,true,{})).success,false);assert.equal(w.a.inGrease(w.f),false);
 assert.equal((await w.a.zone(entry.uid,target,true,saveValues(w,target,1))).success,true);assert.equal(w.a.inGrease(w.f),true);assert.equal(w.e.effectiveConditions(w.f).includes('Сбитый с ног'),false);
 assert.equal((await w.a.zone(entry.uid,target,true,saveValues(w,target,1))).success,false);
 assert.equal((await w.a.zone(entry.uid,target,false,{})).success,true);assert.equal(w.a.inGrease(w.f),false);
 w.f.condImmune=[];assert.equal((await w.a.zone(entry.uid,target,true,saveValues(w,target,1))).success,true);assert.equal(w.e.effectiveConditions(w.f).includes('Сбитый с ног'),true);
});
test('two nonconcentration Grease areas keep independent membership, save DC and expiry',()=>{
 const w=world('Grease'),key='ally:'+w.c.id;const data={zoneName:'Первый квадрат',distanceM:3,clearPath:true,allIncluded:true,members:[],values:{}};
 cast(w,key,data);w.e.combatLifecycleApi.advanceFxRound(2);cast(w,key,{...data,zoneName:'Второй квадрат'});
 const zones=w.c.activeFx.filter(e=>e.artificerBasic?.kind==='grease');assert.equal(zones.length,2);assert.notEqual(zones[0].stackKey,zones[1].stackKey);assert.equal(w.c.slots[1].cur,1);
 w.e.combatLifecycleApi.advanceFxRound(8);assert.equal(w.c.activeFx.filter(e=>e.artificerBasic?.kind==='grease').length,1);
});
test('Grease end-turn asks for human save, cancellation changes nothing, repeated processing of same turn does not duplicate',()=>{
 const w=world('Grease'),key='ally:'+w.c.id;cast(w,key,{zoneName:'Пол',distanceM:0,clearPath:true,allIncluded:true,members:[],values:{}});battle(w);
 w.e.artificerSpellApi.dialogs(()=>null);const before=JSON.stringify(w.c);assert.equal(w.a.turnEnd(key),false);assert.equal(JSON.stringify(w.c),before);
 let calls=0;w.e.artificerSpellApi.dialogs(()=>++calls===1?'да':'1');assert.equal(w.a.turnEnd(key),true);assert.equal(w.e.effectiveConditions(w.c).includes('Сбитый с ног'),true);assert.equal(calls,2);assert.equal(w.a.turnEnd(key),true);assert.equal(calls,2);
});

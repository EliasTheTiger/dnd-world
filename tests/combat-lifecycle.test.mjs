import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function hero(id, overrides = {}) {
  return {id,name:id,cls:'Жрец',level:5,
    ab:{str:10,dex:10,con:10,int:10,wis:16,cha:10},saves:{},skills:{},
    hp:20,hpMax:20,hpTemp:0,inventory:[],equipment:{},abilities:[],activeFx:[],activeEffectsSchemaVersion:1,fxOff:[],
    cond:[],deaths:{s:0,f:0},slots:{1:{max:3,cur:3}},spentRest:0,exhaustion:0,hdUsed:0,...overrides};
}

function concentrationWorld() {
  const e=loadRuntimeIntegrationEngine(),caster=hero('caster'),ally=hero('ally'),other=hero('other');
  e.combatLifecycleApi.quiet();e.guardRandom();
  const spell={id:'concentration-spirit',n:'Дух хранителя',l:1,s:'Вызов',c:'Жрц',t:'1 действие',
    r:'9 м',cm:'В',d:'Концентрация, 2 раунда',conc:true,x:'',fx:[{stat:'ac',mode:'add',value:1}]};
  const mechanics=e.combatLifecycleApi.compileSpellMechanics(spell);
  mechanics.origin='explicit';mechanics.target={kind:'any',base:2};
  mechanics.spell.targeting.count={base:2,perSlot:0,fromSlot:1,allCreatures:false};
  mechanics.spell.summons=[{side:'ally',count:1,template:{n:'Дух',hp:8,hpMax:8,ac:12}}];
  mechanics.spell.environment.effects=[{kind:'light',operation:'create',brightM:6}];
  spell.mechanics=mechanics;
  e.setState({chars:[caster,ally,other],spells:[spell],activeCharId:caster.id});
  const cast=actor=>e.castSpellApply(spell.id,actor.id,`ally:${actor.id}`,'',undefined,'1',null,[`ally:${ally.id}`]);
  assert.equal(cast(caster),true,e.elementText('saveStatus'));
  const castId=e.state().lastCastEvent.castId;
  assert.equal(e.state().foes.filter(f=>f.summonedByCastId===castId).length,1);
  assert.equal(e.combatLifecycleApi.scene().spellEffects.filter(f=>f.castId===castId).length,1);
  return {e,caster,ally,other,spell,cast,castId};
}

function assertCastRemoved(e,castId) {
  assert.equal(e.state().chars.flatMap(c=>c.activeFx).filter(f=>f.castId===castId).length,0,'all creature effects end');
  assert.equal(e.state().foes.filter(f=>f.summonedByCastId===castId).length,0,'summons end with concentration');
  assert.equal(e.combatLifecycleApi.scene().spellEffects.filter(f=>f.castId===castId).length,0,'scene effect ends with concentration');
}

test('concentration break removes creature, summon and scene effects of its cast only',()=>{
  const {e,caster,other,cast,castId}=concentrationWorld();
  assert.equal(cast(other),true);
  const otherCast=e.state().lastCastEvent.castId;
  assert.equal(e.combatLifecycleApi.breakConcentration(caster,'мастер завершил заклинание'),true);
  assertCastRemoved(e,castId);
  assert.ok(other.activeFx.some(f=>f.castId===otherCast));
  assert.ok(e.state().foes.some(f=>f.summonedByCastId===otherCast));
  assert.ok(e.combatLifecycleApi.scene().spellEffects.some(f=>f.castId===otherCast));
  assert.equal(e.combatLifecycleApi.breakConcentration(caster,'повторное нажатие'),false);
});

test('replacing concentration ends the old summon and scene effect before keeping the new group',()=>{
  const {e,caster,cast,castId}=concentrationWorld();
  assert.equal(cast(caster),true);
  assertCastRemoved(e,castId);
  const newCast=e.state().lastCastEvent.castId;
  assert.equal(caster.slots[1].cur,1,'one slot per cast regardless of target count');
  assert.equal(e.state().foes.filter(f=>f.summonedByCastId===newCast).length,1);
  assert.equal(e.combatLifecycleApi.scene().spellEffects.filter(f=>f.castId===newCast).length,1);
});

test('failed player concentration save removes the entire cast, while a successful save preserves it',()=>{
  const {e,caster,castId}=concentrationWorld();
  e.combatLifecycleApi.concDamageCheck(caster,4);
  assert.ok(e.combatLifecycleApi.roll(),'damage requests an external die result');
  e.setElementValue('rollV0',20);e.charactersApi.rollDone();
  assert.ok(caster.activeFx.some(f=>f.castId===castId));
  e.combatLifecycleApi.concDamageCheck(caster,4);
  e.setElementValue('rollV0',1);e.charactersApi.rollDone();
  assertCastRemoved(e,castId);
});

test('round expiry removes every component of the same concentration cast',()=>{
  const {e,castId}=concentrationWorld();
  assert.notEqual(e.combatLifecycleApi.advanceFxRound(2),false);
  assertCastRemoved(e,castId);
});

test('breaking concentration clears legacy markers and non-concentration companions without touching another caster',()=>{
  const {e,caster,ally,other,castId}=concentrationWorld();
  ally.activeFx.push({uid:'companion',castId,casterId:caster.id,conc:false,fx:[],effectSchemaVersion:1});
  caster.activeFx.push({uid:'legacy-concentration',label:'Старая концентрация',casterId:caster.id,conc:true,fx:[],effectSchemaVersion:1});
  other.activeFx.push({uid:'unrelated',label:'Чужая концентрация',casterId:other.id,conc:true,fx:[],effectSchemaVersion:1});
  assert.equal(e.combatLifecycleApi.breakConcentration(caster,'завершена'),true);
  assertCastRemoved(e,castId);
  assert.equal(caster.activeFx.some(f=>f.uid==='legacy-concentration'),false);
  assert.equal(other.activeFx.some(f=>f.uid==='unrelated'),true);
});

test('long rest also removes concentration summons and scene effects through the shared cleanup',()=>{
  const {e,caster,castId}=concentrationWorld();
  assert.equal(e.charactersApi.longRest(),true,e.elementText('saveStatus'));
  assertCastRemoved(e,castId);
});

function startTick(id) {
  return {uid:id,k:'bg3-status',id,label:'Ожидающий урон начала хода',fx:[],effectSchemaVersion:1,
    bg3StatusLifecycle:{schemaVersion:'bg3-status-lifecycle-runtime/1',complete:true,
      tickType:'StartTurn',onTick:[{op:'dealDamage',cnt:1,sides:4,mod:0,damageType:'огонь',where:id}],
      onRemove:[],removeEvents:[],removeCondition:null}};
}

function combatWorld() {
  const e=loadRuntimeIntegrationEngine(),caster=hero('caster'),foe={id:'foe',n:'Враг',hp:20,hpMax:20,
    hpTemp:0,ac:10,abil:{str:10,dex:10,con:10,int:10,wis:10,cha:10},activeFx:[],cond:[],combatActions:[]};
  e.combatLifecycleApi.quiet();e.guardRandom();
  e.setState({chars:[caster],foes:[foe],activeCharId:caster.id});
  const order=[{kind:'ally',id:caster.id,nat:20},{kind:'foe',id:foe.id,nat:1}];
  return {e,caster,foe,order};
}

const plain=value=>JSON.parse(JSON.stringify(value));

test('combat cannot start with an unresolved first-turn status',()=>{
  const {e,caster,foe,order}=combatWorld();
  caster.activeFx.push(startTick('first-tick'));
  const before=plain({caster,foe});
  assert.equal(e.combatStart(order,'Неподтвержденное начало'),false);
  assert.equal(e.state().combat.active,false);
  assert.equal(e.state().combat.turn,null);
  assert.deepEqual(plain({caster,foe}),before);
  assert.match(e.elementText('saveStatus'),/player-input-required/);
});

test('failed next-turn status preserves the current actor, spent actions and end-turn effects',()=>{
  const {e,caster,foe,order}=combatWorld();
  assert.equal(e.combatStart(order,'Последовательный переход'),true);
  assert.equal(e.combatSpend('action','Действие',`ally:${caster.id}`),true);
  caster.activeFx.push({uid:'until-end',label:'Защита',fx:[],effectSchemaVersion:1,combatUntilEndTurn:`ally:${caster.id}`});
  foe.activeFx.push(startTick('next-tick'));
  const before=plain({caster,foe,combat:e.state().combat,round:e.state().fxRound});
  assert.equal(e.combatNextTurn(),false);
  assert.deepEqual(plain({caster,foe,combat:e.state().combat,round:e.state().fxRound}),before);
  assert.equal(e.combatNextTurn(),false,'retry also leaves the same turn intact');
  assert.deepEqual(plain({caster,foe,combat:e.state().combat,round:e.state().fxRound}),before);
});

test('failed wrapped turn restores round duration, scene, summoned actors and log together',()=>{
  const {e,caster,castId}=concentrationWorld();
  const foe={id:'enemy',n:'Враг',hp:20,hpMax:20,abil:{dex:10},activeFx:[],cond:[],combatActions:[]};
  e.state().foes.push(foe);
  assert.equal(e.combatStart([{kind:'ally',id:caster.id,nat:20},{kind:'foe',id:foe.id,nat:1}],'Переход раунда'),true);
  assert.equal(e.combatNextTurn(),true);
  assert.equal(e.combatNextTurn(),true);
  assert.equal(e.combatNextTurn(),true);
  caster.activeFx.push(startTick('wrapped-tick'));
  const before=plain({chars:e.state().chars,foes:e.state().foes,combat:e.state().combat,round:e.state().fxRound,scene:e.combatLifecycleApi.scene()});
  assert.equal(e.combatNextTurn(),false);
  assert.deepEqual(plain({chars:e.state().chars,foes:e.state().foes,combat:e.state().combat,round:e.state().fxRound,scene:e.combatLifecycleApi.scene()}),before);
  caster.activeFx=caster.activeFx.filter(f=>f.uid!=='wrapped-tick');
  assert.equal(e.combatNextTurn(),true,'resolved status permits the next attempt');
  assertCastRemoved(e,castId);
  assert.equal(e.state().combat.round,3);
});

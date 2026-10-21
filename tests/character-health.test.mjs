import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
function world(overrides={}){
  const e=loadRuntimeIntegrationEngine(),a=e.charactersApi,c=Object.assign(e.buildBlank(),overrides);
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id});a.withoutPresentation();e.guardRandom();
  return {e,a,c};
}
function submit(e,a,value){e.setElementValue('rollV0',value);a.rollDone();}
function blockHealing(c){c.activeEffectsSchemaVersion=1;c.activeFx=[{uid:'blocked-healing',k:'test',effectSchemaVersion:1,fx:[{stat:'healing.block',mode:'set',value:1}]}];}

test('short-rest Hit Dice have a zero healing minimum with negative Constitution and spend exactly one die',()=>{
  const {e,a,c}=world({hp:3,ab:{str:10,dex:10,con:3,int:10,wis:10,cha:10}});
  a.spendHitDie();submit(e,a,1);assert.equal(c.hp,3);assert.equal(c.hdUsed,1);
  a.rollDone();assert.equal(c.hdUsed,1);
});
test('Hit Dice heal a stable unconscious hero through the common waking transition without consuming temporary HP',()=>{
  const {e,a,c}=world({hp:0,hpTemp:4,deaths:{s:3,f:0},cond:['Бессознательный']});
  a.spendHitDie();submit(e,a,4);assert.equal(c.hp,4);assert.equal(c.hpTemp,4);assert.equal(c.hdUsed,1);
  assert.deepEqual(plain(c.deaths),{s:0,f:0});assert.ok(!c.cond.includes('Бессознательный'));
});
test('Hit Dice cannot resurrect a dead character or bypass healing prevention',()=>{
  for(const dead of [true,false]){
    const {e,a,c}=world({hp:0,deaths:{s:0,f:dead?3:1},cond:['Бессознательный']});if(!dead)blockHealing(c);
    const before=plain(c);assert.equal(a.spendHitDie(),false);assert.equal(e.castState().spec,null);assert.deepEqual(plain(c),before);
  }
});
test('Hit Die cancellation, duplicate opening and invalid dice never consume another resource',()=>{
  const {e,a,c}=world({level:2,hp:1});a.spendHitDie();const spec=e.castState().spec;
  assert.equal(a.spendHitDie(),false);assert.equal(e.castState().spec,spec);
  submit(e,a,0);assert.equal(c.hdUsed,0);assert.equal(c.hp,1);
  a.rollCancel();assert.equal(e.castState().spec,null);assert.equal(c.hdUsed,0);
  a.spendHitDie();submit(e,a,4);assert.equal(c.hdUsed,1);assert.equal(e.castState().spec,null);
});
test('a Hit Die prompt revalidates remaining dice, healing prevention, death and combat before spending',()=>{
  for(const change of [c=>{c.hdUsed=c.level;},blockHealing,c=>{c.hp=0;c.deaths={s:0,f:3};},(c,e)=>{e.state().combat.active=true;},c=>{c.ab.con=18;}]){
    const {e,a,c}=world({hp:1});a.spendHitDie();change(c,e);const before=plain(c);submit(e,a,4);assert.deepEqual(plain(c),before);
  }
});
test('death saves refuse a conscious, dead or stable hero before any roll is requested',()=>{
  for(const state of [{hp:1},{hp:0,deaths:{s:0,f:3}},{hp:0,deaths:{s:3,f:0}}]){
    const {e,a,c}=world(state),before=plain(c);assert.equal(a.deathSaveRoll(),false);assert.equal(e.castState().spec,null);assert.deepEqual(plain(c),before);
  }
});
test('death-save prompt revalidates healing and stabilization and cannot create queued duplicate saves',()=>{
  for(const change of [c=>{c.hp=4;},c=>{c.deaths={s:3,f:0};},c=>{c.deaths={s:0,f:3};}]){
    const {e,a,c}=world({hp:0});a.deathSaveRoll();assert.equal(a.deathSaveRoll(),false);change(c);const before=plain(c);
    submit(e,a,1);assert.deepEqual(plain(c),before);assert.equal(e.castState().spec,null);
  }
});
test('natural 20 wakes a dying hero but cannot bypass healing prevention',()=>{
  for(const blocked of [false,true]){
    const {e,a,c}=world({hp:0,deaths:{s:1,f:2},cond:['Бессознательный']});if(blocked)blockHealing(c);
    a.deathSaveRoll();submit(e,a,20);assert.equal(c.hp,blocked?0:1);
    assert.deepEqual(plain(c.deaths),blocked?{s:1,f:2}:{s:0,f:0});assert.equal(c.cond.includes('Бессознательный'),blocked);
    if(blocked)assert.match(e.elementText('diceOut'),/не.*восстанавлива|запрещ/i);
  }
});
test('death-save outcomes apply one failure, two failures on natural 1 and stable state on the third success',()=>{
  for(const [roll,deaths,expected] of [[9,{s:0,f:1},{s:0,f:2}],[1,{s:0,f:1},{s:0,f:3}],[10,{s:2,f:1},{s:3,f:0}]]){
    const {e,a,c}=world({hp:0,deaths,cond:['Бессознательный']});a.deathSaveRoll();submit(e,a,roll);assert.deepEqual(plain(c.deaths),expected);assert.equal(c.hp,0);
  }
});
test('manual stabilization cannot resurrect the dead or mark a conscious character as stable',()=>{
  for(const state of [{hp:4},{hp:0,deaths:{s:0,f:3}}]){
    const {a,c}=world(state),before=plain(c);assert.equal(a.stabilizeChar(),false);assert.deepEqual(plain(c),before);
  }
  const {a,c}=world({hp:0,deaths:{s:1,f:2},cond:[]});assert.equal(a.stabilizeChar(),true);
  assert.deepEqual(plain(c.deaths),{s:3,f:0});assert.ok(c.cond.includes('Бессознательный'));
});
test('short rest cannot restore resources of a dead character',()=>{
  const {a,c}=world({hp:0,deaths:{s:0,f:3},hdUsed:1});const before=plain(c);
  assert.equal(a.shortRest(null),false);assert.deepEqual(plain(c),before);
});
test('combat death saves are available once per own turn; cancelling does not spend that chance',()=>{
  const {e,a,c}=world({hp:0});const combat={...e.blankCombat(),active:true,id:'health-combat',round:1,order:[{kind:'ally',id:c.id,initiative:15}],turn:{actorKey:'ally:'+c.id}};
  e.setState({...e.catalogs,chars:[c],activeCharId:c.id,combat});
  assert.equal(a.combatDeathSave(),true);a.rollCancel();assert.equal(e.state().combat.turn.deathSaveDone,undefined);
  assert.equal(a.combatDeathSave(),true);submit(e,a,10);assert.equal(c.deaths.s,1);assert.equal(e.state().combat.turn.deathSaveDone,true);
  assert.equal(a.combatDeathSave(),false);assert.equal(e.castState().spec,null);
  e.state().combat.round=2;e.state().combat.turn={actorKey:'ally:'+c.id};assert.equal(a.combatDeathSave(),true);submit(e,a,10);assert.equal(c.deaths.s,2);
});
test('the sheet cannot roll a death save for an ally out of turn or apply a roll after the turn changes',()=>{
  const {e,a,c}=world({hp:0}),other=Object.assign(e.buildBlank(),{id:'other-health',hp:0});
  const combat={...e.blankCombat(),active:true,id:'health-combat',round:1,order:[{kind:'ally',id:other.id,initiative:15},{kind:'ally',id:c.id,initiative:10}],turn:{actorKey:'ally:'+other.id}};
  e.setState({...e.catalogs,chars:[c,other],activeCharId:c.id,combat});assert.equal(a.deathSaveRoll(),false);
  e.state().combat.turnIndex=1;e.state().combat.turn={actorKey:'ally:'+c.id};assert.equal(a.deathSaveRoll(),true);
  e.state().combat.turnIndex=0;e.state().combat.turn={actorKey:'ally:'+other.id};submit(e,a,1);assert.deepEqual(plain(c.deaths),{s:0,f:0});
});
test('temporary HP and XP reject negative, fractional, empty and unrepresentable values without mutating the hero',()=>{
  const {a,c}=world({xp:300,hpTemp:5});
  for(const value of [-1,1.5,'',Infinity,'1e400',Number.MAX_SAFE_INTEGER+1]){
    assert.equal(a.setTempHp(value),false);assert.equal(c.hpTemp,5);assert.equal(a.setXp(value),false);assert.equal(c.xp,300);
  }
  assert.equal(a.setTempHp('7'),true);assert.equal(c.hpTemp,7);assert.equal(a.setXp('900'),true);assert.equal(c.xp,900);
  assert.equal(a.setTempHp(0),true);assert.equal(a.setXp(0),true);
});
test('legacy multi-level growth records every pending HP gain and lowering level removes only the matching gains',()=>{
  const {e,a,c}=world({hp:7});a.setLevel(5);assert.equal(c.hpMax,10);assert.equal(c.hp,7);
  for(const [value,expected]of [[4,14],[5,19],[6,25],[7,32]]){e.setElementValue('hpGain',value);assert.equal(a.applyHp(),true);assert.equal(c.hpMax,expected);assert.equal(c.hp,7);}
  assert.equal(c.hpPend,false);assert.equal(a.applyHp(),false);assert.deepEqual(plain(c.characterBuild.hpGains),{2:4,3:5,4:6,5:7});
  a.setLevel(3);assert.equal(c.hpMax,19);assert.equal(c.hpPend,false);assert.deepEqual(plain(c.characterBuild.hpGains),{2:4,3:5});
  a.setLevel(4);e.setElementValue('hpGain',8);a.applyHp();assert.equal(c.hpMax,27);assert.equal(c.hpPend,false);
});
test('legacy pending HP survives another level-up, a partial rollback and save/reload without skipping a level',()=>{
  const {e,a,c}=world();a.setLevel(4);e.setElementValue('hpGain',4);a.applyHp();a.setLevel(5);a.setLevel(3);
  assert.deepEqual(plain(c.characterBuild.pendingHpLevels),[3]);assert.equal(c.hpPend,true);assert.equal(c.hpMax,14);
  const saved=plain(c);e.setState({...e.catalogs,chars:[saved],activeCharId:saved.id});e.setElementValue('hpGain',6);a.applyHp();
  assert.equal(saved.hpMax,20);assert.equal(saved.hpPend,false);assert.deepEqual(plain(saved.characterBuild.hpGains),{2:4,3:6});
});
test('legacy CON changes affect recorded levels only and keep per-level HP history consistent on level-down',()=>{
  const {e,a,c}=world();a.setLevel(3);a.abDelta('con',2);assert.equal(c.hpMax,11,'pending levels have not granted their HP yet');
  e.setElementValue('hpGain',5);a.applyHp();e.setElementValue('hpGain',6);a.applyHp();assert.equal(c.hpMax,22);
  a.abDelta('con',2);assert.equal(c.hpMax,25);assert.deepEqual(plain(c.characterBuild.hpGains),{2:6,3:7});
  a.setLevel(2);assert.equal(c.hpMax,18);a.abDelta('con',-4);assert.equal(c.hpMax,14);assert.equal(c.hp,10);
});
test('legacy per-level minimum HP remains reversible across CON changes without losing the original entered gain',()=>{
  const {e,a,c}=world();a.setLevel(2);e.setElementValue('hpGain',1);a.applyHp();assert.equal(c.hpMax,11);
  a.abDelta('con',-4);assert.equal(c.hpMax,9);assert.equal(c.characterBuild.hpGains[2],1);
  a.abDelta('con',4);assert.equal(c.hpMax,11);assert.equal(c.characterBuild.hpGains[2],1);
});
test('a legacy pending single gain without build metadata remains editable and invalid gain inputs do not apply',()=>{
  const {e,a,c}=world({level:2,hpPend:true});
  for(const value of [0,11,1.5,'']){e.setElementValue('hpGain',value);assert.equal(a.applyHp(),false);assert.equal(c.hpMax,10);}
  e.setElementValue('hpGain',5);assert.equal(a.applyHp(),true);assert.equal(c.hpMax,15);assert.equal(c.hpPend,false);
});
test('changing the Hit Die of a manually rolled character requires confirmation and never reuses d12 rolls as d6',()=>{
  const {a,c}=world({cls:'Варвар',level:3,hp:13,hpMax:36,hpProgression:{method:'manual',rolls:[12,12]}});a.characterAdopt(c);
  a.confirmWith(()=>false);const before=plain(c);assert.equal(a.setClass('Волшебник'),false);assert.deepEqual(plain(c),before);
  a.confirmWith(()=>true);assert.equal(a.setClass('Волшебник'),true);assert.equal(c.hpMax,14);assert.equal(c.hp,13);assert.equal(c.hpProgression.method,'average');
  assert.deepEqual(plain(c.characterBuild.hpProgressionArchive.Варвар.rolls),[12,12]);
  assert.equal(a.setClass('Варвар'),true);assert.equal(c.hpMax,36);assert.equal(c.hp,13);assert.equal(c.hpProgression.method,'manual');assert.deepEqual(plain(c.hpProgression.rolls),[12,12]);
});
test('class changes with the same Hit Die preserve manual HP and restoration tracks missing higher-level rolls',()=>{
  const {e,a,c}=world({cls:'Воин',level:2,hp:5,hpMax:18,hpProgression:{method:'manual',rolls:[8]}});a.characterAdopt(c);
  a.confirmWith(()=>{throw Error('the same d10 requires no conversion');});a.setClass('Паладин');assert.equal(c.hpMax,18);assert.equal(c.hpProgression.method,'manual');
  a.confirmWith(()=>true);a.setClass('Волшебник');a.setLevel(3);a.setClass('Паладин');assert.equal(c.hpMax,18);assert.equal(c.hpPend,true);
  e.setElementValue('hpGain',6);a.applyHp();assert.equal(c.hpMax,24);assert.equal(c.hpPend,false);assert.equal(c.hp,5);
});
test('2014 exhaustion changes live checks, initiative, attacks, saves and walking speed after the effects cache was read',()=>{
  const {e,a,c}=world({hp:20,hpMax:20});assert.equal(a.speedTotal(c),'30 футов');assert.equal(a.rollFxEntries(c,'skill.Внимательность').length,0);
  a.setExhaustion(1);a.rollCheck('Внимательность',0,'skill.Внимательность');assert.equal(e.castState().spec.rows.length,2);a.rollCancel();
  assert.ok(a.rollFxEntries(c,'init').some(f=>f.mode==='dis'));assert.ok(!a.rollFxEntries(c,'attack.str').some(f=>f.mode==='dis'));
  a.setExhaustion(2);assert.equal(a.speedTotal(c),'15 футов');assert.equal(a.effectiveSpeed(c),'15 футов');
  a.setExhaustion(3);assert.ok(a.rollFxEntries(c,'attack.str').some(f=>f.mode==='dis'));assert.ok(a.rollFxEntries(c,'save.con').some(f=>f.mode==='dis'));
  a.setExhaustion(0);assert.equal(a.speedTotal(c),'30 футов');assert.ok(!a.rollFxEntries(c,'save.con').some(f=>f.mode==='dis'));
});
test('2014 exhaustion halves maximum HP at four without changing base HP, and reduction does not grant free healing',()=>{
  const {e,a,c}=world({hp:19,hpMax:21,hpTemp:8});assert.equal(e.eHpMax(c),21);
  a.setExhaustion(4);assert.equal(e.eHpMax(c),10);assert.equal(c.hpMax,21);assert.equal(c.hp,10);assert.equal(c.hpTemp,8);
  a.setExhaustion(3);assert.equal(e.eHpMax(c),21);assert.equal(c.hp,10);
  a.setExhaustion(4);assert.equal(a.longRest(),true);assert.equal(c.exhaustion,3);assert.equal(c.hp,21);
});
test('exhaustion changes refresh derived rolls, speed and maximum HP in both ordinary and scoped effect caches',()=>{
  const {e,a,c}=world({hp:20,hpMax:20});
  const check=()=>{
    for(const level of [0,4,0]){
      c.exhaustion=level;
      assert.equal(a.rollFxEntries(c,'skill.Магия').some(f=>f.mode==='dis'),level>0);
      assert.equal(a.rollFxEntries(c,'attack.str').some(f=>f.mode==='dis'),level>=3);
      assert.equal(a.rollFxEntries(c,'save.con').some(f=>f.mode==='dis'),level>=3);
      assert.equal(a.speedTotal(c),level>=2?'15 футов':'30 футов');
      assert.equal(e.eHpMax(c),level>=4?10:20);
    }
  };
  check();a.withFreshEffects(check);
});
test('2014 exhaustion halves flying speed and fifth degree prevents movement despite flight',()=>{
  const {a,c}=world({activeFx:[{uid:'flight',k:'test',effectSchemaVersion:1,fx:[{stat:'speed.fly',mode:'set',value:'60 футов'}]}]});
  assert.match(a.speedTotal(c),/^60 /);a.setExhaustion(2);assert.match(a.speedTotal(c),/^30 .*ходьба 15/);
  a.setExhaustion(5);assert.equal(a.speedTotal(c),'0 футов');assert.equal(a.effectiveSpeed(c),'0 футов');
});
test('sixth degree of 2014 exhaustion causes persistent death and ends the whole concentration group',()=>{
  const {e,a,c}=world({hp:20,hpMax:20,hpTemp:5}),ally=Object.assign(e.buildBlank(),{id:'exhaustion-ally'});
  for(const target of [c,ally])target.activeFx=[{uid:'exhaust-'+target.id,k:'spell',id:'test',label:'Концентрация',casterId:c.id,conc:true,castId:'exhaustion-cast',fx:[],effectSchemaVersion:1}];
  e.setState({...e.catalogs,chars:[c,ally],activeCharId:c.id});assert.equal(a.setExhaustion(6),true);assert.equal(c.hp,0);assert.equal(c.hpTemp,5);assert.deepEqual(plain(c.deaths),{s:0,f:3});assert.ok(c.cond.includes('Бессознательный'));assert.equal(ally.activeFx.length,0);assert.equal(c.activeFx.length,0);
  a.setExhaustion(0);assert.equal(c.hp,0);assert.deepEqual(plain(c.deaths),{s:0,f:3});assert.equal(a.setHp(1),false);assert.equal(a.longRest(),false);assert.equal(a.deathSaveRoll(),false);
});
test('invalid exhaustion values leave HP, death and derived effects unchanged',()=>{
  const {e,a,c}=world({hp:8,hpMax:10,exhaustion:2});a.speedTotal(c);const before=plain(c);
  for(const value of ['',1.5,-1,7,Infinity,'no']){assert.equal(a.setExhaustion(value),false);assert.deepEqual(plain(c),before);assert.equal(e.eHpMax(c),10);assert.equal(a.speedTotal(c),'15 футов');}
});

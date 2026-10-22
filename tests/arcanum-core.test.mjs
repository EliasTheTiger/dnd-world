import assert from 'node:assert/strict';
import test from 'node:test';
import core from '../scripts/arcanum-core.js';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const carrier=(saveOk=false,raw=31,total=raw)=>({saveMade:true,saveOk,dmgRaw:raw,dmgTotal:total});
test('SRD2014 circle contracts use shared d6, CON halves and reusable 500gp pearl powder',()=>{
  const original={schemaVersion:1,spell:{input:{custom:true},resources:{slot:{minimumLevel:6}}}},before=plain(original),m=core.buildMechanics('circleOfDeath',original);
  assert.deepEqual(original,before);assert.equal(m.resolution.rolls[0].sides,6);assert.equal(m.resolution.rolls[0].cnt,8);
  assert.deepEqual(m.resolution.rolls[0].upcast,{fromSlot:6,perSlot:2});assert.equal(m.resolution.save.key,'con');assert.equal(m.resolution.save.half,true);
  assert.equal(m.components.material.consume,0);assert.equal(m.components.material.cost,500);assert.equal(m.target.allCreatures,true);
  assert.equal(m.spell.range.distanceM,45.72);assert.equal(m.spell.targeting.area.radiusM,18.288);assert.equal(m.spell.input.requireCompleteRolls,true);
  assert.deepEqual(m.spell.resources,original.spell.resources);assert.equal(core.buildMechanics('unknown',original),null);
});
test('True Seeing uses a willing creature, consumable ointment and a non-concentration hour',()=>{
  const m=core.buildMechanics('trueSeeing',{schemaVersion:1,spell:{}});
  assert.equal(m.components.material.cost,25);assert.equal(m.components.material.consume,1);assert.equal(m.duration.rounds,600);assert.equal(m.duration.concentration,false);
  assert.equal(m.resolution.needsRoll,false);assert.deepEqual(m.resolution.rolls,[]);assert.equal(m.target.kind,'any','willing enemies are legal targets');
  assert.equal(m.effects.find(row=>row.stat==='vision.true').value,36.576);assert.ok(!m.effects.some(row=>row.stat==='vision.invisible'),'do not grant unlimited invisible sight');
  assert.equal(core.validateTrueSeeingInput({willing:true,distanceM:1.5}).ok,true);
  for(const input of [{},{willing:false,distanceM:1},{willing:true},{willing:true,distanceM:2},{willing:true,distanceM:''},{willing:true,distanceM:-1}])assert.equal(core.validateTrueSeeingInput(input).ok,false);
});
test('missing, forged or inconsistent Circle damage never becomes a failed save',()=>{
  const valid=carrier();assert.equal(core.validateCircleDamage([valid]).ok,true);
  for(const row of [null,{}, {...valid,saveMade:false},{...valid,saveOk:null},{...valid,dmgRaw:7},{...valid,dmgRaw:49},{...valid,dmgRaw:8.5},{...valid,dmgTotal:-1}])assert.equal(core.validateCircleDamage([row]).ok,false);
  assert.equal(core.validateCircleDamage([valid,carrier(false,32)]).ok,false);
  assert.equal(core.validateCircleDamage([]).ok,false);assert.equal(core.validateCircleDamage([carrier(false,8)],7).ok,false);
  assert.equal(core.validateCircleDamage([carrier(false,84)],9).ok,true);assert.equal(core.circleDiceCount(9),14);assert.equal(core.circleDiceCount(10),null);
});
test('Circle computes saving throw before per-target resistance and immunity',()=>{
  const rows=[carrier(false,31,31),carrier(true,31,15),carrier(true,31,7),carrier(false,31,0),carrier(true,31,30)];
  const resolve=(saved,index)=>index===2?Math.floor(saved/2):index===3?0:index===4?saved*2:saved;
  assert.equal(core.validateCircleDamage(rows,6,resolve).ok,true);
  assert.equal(core.validateCircleDamage(rows,6,amount=>amount).ok,false,'changed defenses must invalidate previously calculated outcomes');
  assert.equal(core.validateCircleDamage([carrier(true,31,16)],6,value=>value).ok,false,'half damage rounds down');
});
test('Circle targets may be farther than spell range from caster but must be within sphere and uncovered',()=>{
  const input={centerDistanceM:45.72,clearPath:true,allCreaturesIncluded:true,byTarget:{enemy:{distanceFromCenterM:18.288,totalCover:false},friend:{distanceFromCenterM:0,totalCover:false}}};
  assert.equal(core.validateCircleArea(input,['enemy','friend']).ok,true);
  for(const changed of [{centerDistanceM:45.73},{clearPath:false},{allCreaturesIncluded:false},{byTarget:{enemy:{distanceFromCenterM:18.3,totalCover:false}}},{byTarget:{enemy:{distanceFromCenterM:1,totalCover:true}}},{byTarget:{enemy:{distanceFromCenterM:1}}}])assert.equal(core.validateCircleArea({...input,...changed},['enemy']).ok,false);
  assert.equal(core.validateCircleArea(input,['enemy','enemy']).ok,false);
});
test('True Seeing changes perception only while active, within 120ft, and not blinded',()=>{
  const effects=core.buildMechanics('trueSeeing').effects;
  const inside=core.visionCapabilities(effects,36.576);assert.equal(inside.seeInvisible,true);assert.equal(inside.seeEthereal,true);assert.equal(inside.noticeMagicalSecretDoors,true);assert.equal(inside.recognizeVisualIllusions,true);assert.equal(inside.seeOriginalForm,true);
  for(const distance of [36.577,null,undefined,'',-1,Infinity])assert.equal(core.visionCapabilities(effects,distance).seeInvisible,false);
  assert.equal(core.visionCapabilities(effects,null).requiresDistance,true);
  assert.equal(core.visionCapabilities(effects,1,['Ослеплённый']).seeInvisible,false);
  assert.equal(core.visionCapabilities([],1).seeInvisible,false,'expired or suppressed effect does not reveal targets');
  const native=[{stat:'vision.true',value:10}];assert.equal(core.visionCapabilities(native,5).noticeMagicalSecretDoors,false,'magically hidden secret doors are an additional spell benefit');
});
test('Circle actual runtime requests human CON and d6 sums, applies saved damage against each defense',()=>{
  const e=loadRuntimeIntegrationEngine(),caster=Object.assign(e.buildBlank(),{id:'caster',cls:'Колдун',level:11,ab:{str:10,dex:10,con:10,int:10,wis:10,cha:18}}),target=Object.assign(e.buildBlank(),{id:'target',ab:{str:10,dex:10,con:10,int:10,wis:10,cha:10}});
  e.setState({...e.catalogs,chars:[caster,target]});e.guardRandom();
  const sp=e.state().spells.find(row=>e.grimoireApi.grimoireActive(row)&&row.grimoire.english==='Circle of Death');assert.ok(sp);
  sp.mechanics=core.buildMechanics('circleOfDeath',sp.mechanics);
  for(const [field,save,expected] of [[null,1,31],[null,20,15],['resist',20,7],['immune',1,0],['vuln',20,30]]){
    target.resist=[];target.immune=[];target.vuln=[];if(field)target[field]=['некротическая энергия'];
    const spec=e.rollSpecOf(sp,{kind:'spell',caster,slotLvl:6,target:e.targetInfoOf('ally:target')});
    assert.equal(spec.meta.saveKey,'con');assert.equal(spec.meta.half,true);assert.ok(spec.rows.some(row=>row.key==='dmg0'&&row.cnt===8&&row.sides===6));
    const outcome=e.resolveOutcome(spec,{save,dmg0:31});assert.equal(outcome.dmgRaw,31);assert.equal(outcome.dmgTotal,expected,field||String(save));
  }
});

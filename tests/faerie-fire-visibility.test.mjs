import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntimeIntegrationEngine} from './helpers/runtime-catalog-loader.mjs';

function world() {
  const e=loadRuntimeIntegrationEngine();e.setState({...e.catalogs});e.partyStarterApi.ensureCatalogs();
  const c=e.partyStarterApi.prepare().character,t=Object.assign(e.buildBlank(),{id:'faerie-target',name:'Подсвеченная цель',hp:30,hpMax:30});
  const f=JSON.parse(JSON.stringify(e.catalogs.foes.find(row=>row.id==='foe_goblin_scout')));
  e.setState({...e.state(),chars:[c,t],foes:[f],activeCharId:c.id});e.artificerSpellApi.quiet();e.charactersApi.withoutPresentation();e.guardRandom();
  const spell=name=>e.state().spells.find(row=>row.grimoire?.english===name&&e.grimoireApi.grimoireActive(row)),fire=spell('Faerie Fire'),bolt=spell('Fire Bolt');
  function illuminate(target){
    const spec=e.rollSpecOf(fire,{kind:'spell',caster:c,slotLvl:1,target:e.targetInfoOf(target),distanceM:6}),values={save:1};
    const outcome=e.resolveOutcome(spec,values),check=e.validateFormulaValues(spec,values,outcome);assert.equal(check.ok,true,JSON.stringify(check.errors));
    const built=e.charactersApi.castFormulaRollsBuild(spec,values,outcome);assert.equal(built.ok,true,built.reason);
    assert.equal(e.castSpellApply(fire.id,c.id,target,'',undefined,'1',built.rolls,[],{},{}),true,e.elementText('castErr'));
  }
  const attack=(actor,target,distanceM=6)=>e.rollSpecOf(bolt,{kind:'spell',caster:actor,slotLvl:0,target:e.targetInfoOf(target),distanceM,within5:distanceM<=1.5}).rows.find(row=>row.type==='atk');
  return {e,c,t,f,fire,illuminate,attack};
}

test('Faerie Fire actual cast grants advantage to sighted attackers but cannot cancel a blinded attacker’s disadvantage',()=>{
  const {c,t,illuminate,attack}=world(),target='ally:'+t.id;illuminate(target);
  assert.equal(attack(c,target).adv,1);
  c.cond=['Ослепленный'];assert.equal(attack(c,target).adv,2,'seeing the glow is required; blindness remains disadvantage');
  c.cond=[];assert.equal(attack(c,target).adv,1);
});

test('Faerie Fire reveals an invisible target without removing its invisibility condition',()=>{
  const {e,c,t,illuminate,attack}=world(),target='ally:'+t.id;t.cond=['Невидимый'];
  assert.equal(attack(c,target).adv,2);illuminate(target);assert.equal(attack(c,target).adv,1);
  assert.ok(e.effectiveConditions(t).includes('Невидимый'),'the spell suppresses invisibility benefits instead of deleting the condition');
  e.artificerUtilityApi.breakConcentration(c,'проверка');assert.equal(attack(c,target).adv,2);
});

test('an illuminated invisible attacker loses invisibility advantage and is visible for nearby ranged-attack penalties',()=>{
  const {t,f,illuminate,attack}=world(),enemy='foe:'+f.id;t.cond=['Невидимый'];
  assert.equal(attack(t,enemy).adv,1);illuminate('ally:'+t.id);
  assert.equal(attack(t,enemy).adv,0,'illumination removes the attacking benefit of invisibility');
  assert.equal(attack(t,enemy,1).adv,2,'a nearby enemy can see the illuminated ranged attacker');
});

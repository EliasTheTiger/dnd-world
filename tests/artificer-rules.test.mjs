import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const R=require('../scripts/artificer-rules.js');
const C=require('../scripts/character-rules.js');
const character=(extra={})=>({id:'alchemist',cls:'Изобретатель',subcls:'Алхимик',level:3,ab:{str:8,dex:14,con:14,int:16,wis:13,cha:10},...extra});
const known=['enhanced-defense','enhanced-weapon','repeating-shot','returning-weapon'];
const itemRows=[{id:'armor',kind:'armor',magic:false},{id:'crossbow',kind:'weapon',weaponCategory:'simple',properties:['ammunition','loading','two-handed'],magic:false},{id:'dagger',kind:'weapon',weaponCategory:'simple',properties:['finesse','thrown'],magic:false}];
const elixir=kind=>R.elixirPlan(character(),{source:'slot',kind,slotLevel:1,availableSlots:1,hasSupplies:true,emptyFlasks:1}).elixirs[0];

test('level-3 Alchemist has the 2020 progression and no premature subclass bonuses',()=>{
  const p=R.profile(character());
  assert.deepEqual(p.slots,[3]);assert.equal(p.maxCircle,1);assert.equal(p.cantrips,2);assert.equal(p.preparedLimit,4);
  assert.deepEqual(p.alwaysPrepared,['Healing Word','Ray of Sickness']);assert.equal(p.infusionsKnown,4);assert.equal(p.infusedItems,2);assert.equal(p.freeElixirs,1);
  assert.equal(p.alchemicalSavant,false);assert.equal(p.restorativeReagents,false);assert.equal(p.chemicalMastery,false);
  assert.equal(p.ritualRequiresPrepared,true);assert.equal(p.requiresToolFocus,true);assert.equal(p.infusedFocus,true);
});

test('every level uses actual artificer slots, cantrips and subclass boundaries',()=>{
  const expected=[[2],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]];
  for(let level=1;level<=20;level++){
    const p=R.profile(character({level}));assert.deepEqual(p.slots,expected[level-1]);assert.equal(p.preparedLimit,3+Math.floor(level/2));
    assert.equal(p.cantrips,level<10?2:level<14?3:4);assert.equal(p.alchemist,level>=3);
    assert.equal(p.freeElixirs,level<3?0:level<6?1:level<15?2:3);assert.equal(p.alchemicalSavant,level>=5);assert.equal(p.restorativeReagents,level>=9);assert.equal(p.chemicalMastery,level>=15);
    assert.equal(p.rightTool,level>=3);assert.equal(p.toolExpertise,level>=6);
  }
  assert.equal(R.profile(character({cls:'Волшебник'})),null);
  for(const level of [0,21,2.5,NaN,'3']){assert.equal(R.profile(character({level})),null);assert.deepEqual(R.slots(level),[]);assert.equal(R.cantrips(level),0);}
  assert.equal(R.preparedLimit(character({level:1,ab:{int:3}})),1);
  assert.deepEqual(R.alwaysPrepared(character({level:2})),[]);
  assert.deepEqual(R.alwaysPrepared(character({level:13})),['Healing Word','Ray of Sickness','Flaming Sphere','Acid Arrow','Gaseous Form','Mass Healing Word','Blight','Death Ward']);
});

test('class and background tool proficiencies combine with the Alchemist replacement',()=>{
  const c=character({race:'Полуэльф',buildChoices:{abilities:['int','con'],tools:['Инструменты стеклодува','Инструменты алхимика','Инструменты каллиграфа'],languages:['Драконий','Гномий']}}),cls={n:'Изобретатель',subs:[['Алхимик']],mechanics:{}};
  const bg={skills:['Проницательность','Убеждение'],toolChoices:[R.artisanTools],languageChoices:1};
  const p=C.training(c,{n:'Полуэльф'},cls,bg,[]);
  assert.deepEqual(p.savingThrows,['con','int']);assert.equal(p.armor.light,true);assert.equal(p.armor.medium,true);assert.equal(p.armor.shield,true);assert.equal(p.armor.heavy,undefined);assert.equal(p.weapons.simple,true);
  assert.equal(p.toolChoices.length,3);assert.deepEqual(p.tools,['Воровские инструменты','Инструменты жестянщика','Инструменты алхимика','Инструменты стеклодува','Инструменты каллиграфа']);
  assert.ok(p.toolChoices[2].includes('Инструменты каллиграфа'));assert.ok(!p.toolChoices[2].includes('Инструменты алхимика'));assert.ok(!p.toolChoices[2].includes('Инструменты стеклодува'));
  assert.equal(C.subclassLevel(cls),3);assert.equal(C.classTraining(cls,c).skills.choose,2);
  c.level=2;assert.equal(C.training(c,{n:'Полуэльф'},cls,bg,[]).toolChoices.length,2);
  c.level=3;c.buildChoices.tools=['Инструменты стеклодува','Инструменты каллиграфа'];assert.equal(C.training(c,{n:'Полуэльф'},cls,bg,[]).toolChoices.length,2);
});

test('always-prepared engine grants use level gates and do not replace the class quota',()=>{
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../scripts/magic-rules.js',import.meta.url),'utf8'),context);
  const rows=JSON.parse(JSON.stringify(context.DND_MAGIC_RULES.subclassSpells(character())));
  assert.equal(rows.length,10);assert.deepEqual(rows.filter(r=>r.level<=3).map(r=>r.english),R.alwaysPrepared(character()));assert.ok(rows.every(r=>r.kind==='prepared'&&r.source==='Алхимик'));
  assert.deepEqual(rows.filter(r=>r.level===13).map(r=>r.english),['Blight','Death Ward']);
});

test('free elixirs require physical d6 results, separate empty flasks and earned rest entitlement',()=>{
  const c=character(),before=structuredClone(c);
  for(let roll=1;roll<=6;roll++){
    const result=R.elixirPlan(c,{source:'rest',rolls:[roll],restAvailable:1,hasSupplies:true,emptyFlasks:1});
    assert.equal(result.ok,true);assert.equal(result.elixirs[0].kind,R.elixirs[roll-1].id);assert.deepEqual(result.cost,{action:0,slotLevel:0,slots:0,flasks:1,restUses:1});assert.equal(result.elixirs[0].expires,'creator-next-long-rest');
  }
  const base={source:'rest',rolls:[1],restAvailable:1,hasSupplies:true,emptyFlasks:1};
  for(const extra of [{rolls:[]},{rolls:[0]},{rolls:[7]},{rolls:[1,2]},{rolls:[1.5]},{rolls:['1']},{restAvailable:0},{restAvailable:2},{hasSupplies:false},{emptyFlasks:0}])assert.equal(R.elixirPlan(c,{...base,...extra}).ok,false,JSON.stringify(extra));
  assert.deepEqual(c,before);
  assert.equal(R.elixirPlan(character({level:6}),{...base,restAvailable:2,rolls:[2,2],emptyFlasks:2}).ok,true,'separate rolls may produce the same effect');
});

test('chosen extra elixirs consume one action and one slot without upcast improvement',()=>{
  const base={source:'slot',kind:'healing',slotLevel:1,availableSlots:3,hasSupplies:true,emptyFlasks:1};
  const a=R.elixirPlan(character(),base);assert.deepEqual(a.cost,{action:1,slotLevel:1,slots:1,flasks:1,restUses:0});
  assert.equal(R.elixirPlan(character(),{...base,slotLevel:2}).ok,false);assert.equal(R.elixirPlan(character(),{...base,availableSlots:0}).ok,false);assert.equal(R.elixirPlan(character(),{...base,kind:'unknown'}).ok,false);
  const b=R.elixirPlan(character({level:5}),{...base,slotLevel:2});assert.equal(b.ok,true);assert.equal(b.elixirs[0].kind,a.elixirs[0].kind);
  assert.equal(R.elixirPlan(character({level:2}),base).ok,false);assert.equal(R.elixirPlan(character({subcls:'Бронник'}),base).ok,false);
});

test('healing uses both entered d4s plus Intelligence and no Alchemical Savant spell bonus',()=>{
  const c=character(),e=elixir('healing');assert.equal(R.elixirUsePlan(c,e,{self:true,healingDice:[1,4]}).healing,8);
  assert.equal(R.elixirUsePlan(character({level:5}),e,{self:true,healingDice:[1,4]}).healing,8);
  for(const healingDice of [[],[5,1],[0,2],[2,2,2],[2.5,2],['2',2]])assert.equal(R.elixirUsePlan(c,e,{self:true,healingDice}).ok,false);
  assert.equal(R.elixirUsePlan(c,e,{self:false,targetUnconscious:true,withinTouch:true,healingDice:[2,3]}).ok,true);
  assert.equal(R.elixirUsePlan(c,e,{self:false,targetUnconscious:false,withinTouch:true,healingDice:[2,3]}).ok,false);
  assert.equal(R.elixirUsePlan(c,e,{self:false,targetUnconscious:true,withinTouch:false,healingDice:[2,3]}).ok,false);
});

test('elixirs have exact durations, no concentration and per-roll Boldness dice',()=>{
  const expected={swiftness:[3600,{walkingSpeedBonus:3}],resilience:[600,{armorClassBonus:1}],boldness:[60,{attackBonusDice:'1d4',savingThrowBonusDice:'1d4'}],flight:[600,{flyingSpeed:3}]};
  for(const [kind,[duration,effects]] of Object.entries(expected)){
    const result=R.elixirUsePlan(character(),elixir(kind),{self:true});assert.equal(result.ok,true);assert.equal(result.durationSeconds,duration);assert.deepEqual(result.effects,effects);assert.equal(result.concentration,false);assert.equal(result.cost.action,1);assert.equal(result.stackKey,'artificer-elixir:'+kind);
  }
  assert.equal(R.elixirUsePlan(character(),{...elixir('flight'),consumed:true},{self:true}).ok,false);
  assert.equal(R.elixirUsePlan(character(),{...elixir('flight'),expired:true},{self:true}).ok,false);
  assert.equal(R.elixirUsePlan(character({id:'someone-else'}),elixir('flight'),{self:true}).ok,false);
});

test('Transformation requires its actual Alter Self choice and retains nonconcentration duration',()=>{
  const c=character(),e=elixir('transformation');assert.equal(R.elixirUsePlan(c,e,{self:true}).ok,false);
  const aquatic=R.elixirUsePlan(c,e,{self:true,transformationChoice:'aquatic'});assert.equal(aquatic.effects.waterBreathing,true);assert.equal(aquatic.effects.swimmingSpeedEqualsWalking,true);assert.equal(aquatic.durationSeconds,600);assert.equal(aquatic.concentration,false);
  assert.equal(R.elixirUsePlan(c,e,{self:true,transformationChoice:'natural-weapons'}).ok,false);
  const natural=R.elixirUsePlan(c,e,{self:true,transformationChoice:'natural-weapons',naturalWeaponDamage:'slashing'});assert.deepEqual(natural.effects.naturalWeapon,{dice:'1d6',ability:'str',damageType:'slashing',attackBonus:1,damageBonus:1,magical:true,proficient:true});
});

test('Restorative Reagents adds entered temporary HP only from level 9, never stacks healing',()=>{
  const c=character({level:9}),e=elixir('healing');assert.equal(R.elixirUsePlan(c,e,{self:true,healingDice:[2,3]}).ok,false);
  const r=R.elixirUsePlan(c,e,{self:true,healingDice:[2,3],tempHpDice:[3,6]});assert.equal(r.healing,8);assert.equal(r.tempHp,12);
  const r8=R.elixirUsePlan(character({level:8}),e,{self:true,healingDice:[2,3],tempHpDice:[3,6]});assert.equal(r8.tempHp,0);
});

test('infusion loadout validates all items before returning a pure plan',()=>{
  const c=character(),context={longRestCompleted:true,items:structuredClone(itemRows)},before=structuredClone({c,context});
  const selections=[{infusionId:'enhanced-defense',itemId:'armor'},{infusionId:'repeating-shot',itemId:'crossbow'}];
  const p=R.infusionPlan(c,known,selections,context);assert.equal(p.ok,true);assert.equal(p.active.length,2);assert.equal(p.active[0].effects.armorClassBonus,1);assert.equal(p.active[1].attunement,true);assert.equal(p.active[1].effects.createsAmmunition,true);assert.equal(p.active[1].effects.ignoreLoading,true);assert.equal(p.active[1].effects.ignoreTwoHanded,undefined);assert.equal(p.expiresAfterCreatorDeathDays,3);
  assert.deepEqual({c,context},before);
  const invalid=[selections.concat({infusionId:'returning-weapon',itemId:'dagger'}),[{infusionId:'enhanced-defense',itemId:'armor'},{infusionId:'enhanced-defense',itemId:'crossbow'}],[{infusionId:'enhanced-weapon',itemId:'crossbow'},{infusionId:'repeating-shot',itemId:'crossbow'}],[{infusionId:'repeating-shot',itemId:'dagger'}],[{infusionId:'returning-weapon',itemId:'crossbow'}],[{infusionId:'enhanced-defense',itemId:'absent'}]];
  for(const choice of invalid)assert.equal(R.infusionPlan(c,known,choice,context).ok,false,JSON.stringify(choice));
  assert.equal(R.infusionPlan(c,known,selections,{...context,longRestCompleted:false}).ok,false);
  context.items[0].magic=true;assert.equal(R.infusionPlan(c,known,selections,context).ok,false);assert.equal(c.hp,undefined);
});

test('known infusions respect minimum levels, capacity and single replacement on level up',()=>{
  const c=character();assert.equal(R.knownInfusionsPlan(c,known).ok,true);assert.equal(R.knownInfusionsPlan(c,known.concat('mind-sharpener')).ok,false);
  assert.equal(R.knownInfusionsPlan(c,['enhanced-defense','enhanced-defense']).ok,false);assert.equal(R.knownInfusionsPlan(c,['radiant-weapon']).ok,false);
  const changed=['enhanced-defense','enhanced-weapon','repeating-shot','mind-sharpener'];
  assert.equal(R.knownInfusionsPlan(c,changed,{previous:known}).ok,false);assert.equal(R.knownInfusionsPlan(c,changed,{previous:known,levelGained:true}).ok,true);
  assert.equal(R.knownInfusionsPlan(c,['enhanced-defense','enhanced-weapon'],{previous:known,levelGained:true}).ok,false);
  assert.equal(R.knownInfusionsPlan(character({level:6}),known.concat('radiant-weapon','mind-sharpener')).ok,true);
  assert.equal(R.infusionDefinition('enhanced-defense',9).effects.armorClassBonus,1);assert.equal(R.infusionDefinition('enhanced-defense',10).effects.armorClassBonus,2);
  assert.equal(R.infusionDefinition('repeating-shot',20).effects.attackBonus,1);assert.equal(R.infusionDefinition('enhanced-arcane-focus',10).effects.spellAttackBonus,2);assert.equal(R.infusionDefinition('enhanced-arcane-focus',10).effects.spellSaveDcBonus,undefined);
});

test('tinkering uses an action and automatically ends the oldest effect when at capacity',()=>{
  const c=character({ab:{int:14}}),request={itemId:'stone-a',kind:'light',tiny:true,nonmagical:true,hasToolsInHand:true};
  const a=R.tinkeringPlan(c,request,[]);assert.equal(a.ok,true);assert.deepEqual(a.active[0].effects,{brightLight:1.5,dimLight:1.5});assert.equal(a.cost.action,1);
  const b=R.tinkeringPlan(c,{...request,itemId:'stone-b'},a.active),d=R.tinkeringPlan(c,{...request,itemId:'stone-c'},b.active);
  assert.deepEqual(d.active.map(r=>r.itemId),['stone-b','stone-c']);assert.deepEqual(d.removed.map(r=>r.itemId),['stone-a']);assert.equal(b.active.length,2);
  assert.equal(R.tinkeringPlan(c,request,a.active).ok,false);assert.equal(R.tinkeringPlan(c,{...request,nonmagical:false},[]).ok,false);assert.equal(R.tinkeringPlan(c,{...request,hasToolsInHand:false},[]).ok,false);
  assert.equal(R.tinkeringPlan(c,{...request,kind:'message',text:'Иди домой',seconds:7},[]).ok,false);assert.equal(R.tinkeringPlan(c,{...request,kind:'message',text:'Иди домой',seconds:6},[]).ok,true);
  assert.equal(R.tinkeringPlan(c,{...request,kind:'image',text:Array(26).fill('слово').join(' ')},[]).ok,false);
});

test('Right Tool for the Job requires an actual uninterrupted hour, replaces only its own tools',()=>{
  const request={tool:'Инструменты стеклодува',hasToolsInHand:true,uninterruptedMinutes:60,spaceWithinReach:true};
  const p=R.rightToolPlan(character(),request);assert.equal(p.ok,true);assert.equal(p.magical,false);assert.equal(p.replacesPrevious,true);assert.equal(p.expires,'next-right-tool-use');assert.equal(p.cost.minutes,60);
  assert.equal(R.rightToolPlan(character({level:2}),request).ok,false);
  for(const extra of [{tool:'Воровские инструменты'},{hasToolsInHand:false},{uninterruptedMinutes:59},{spaceWithinReach:false}])assert.equal(R.rightToolPlan(character(),{...request,...extra}).ok,false);
});

test('exported definitions cannot be modified, and returned progression is independent',()=>{
  assert.throws(()=>{R.elixirs[0].roll=6;},TypeError);assert.throws(()=>{R.infusionCatalog[0].effects.armorClassBonus=99;},TypeError);
  const a=R.slots(3);a[0]=99;assert.deepEqual(R.slots(3),[3]);const p=R.infusionDefinition('enhanced-defense',3);p.effects.armorClassBonus=99;assert.equal(R.infusionDefinition('enhanced-defense',3).effects.armorClassBonus,1);
  assert.equal(/Math\s*\.\s*random\s*\(|crypto\s*\.\s*getRandomValues\s*\(/.test(fs.readFileSync(new URL('../scripts/artificer-rules.js',import.meta.url),'utf8')),false);
});
